/**
 * A wrapper around gan-web-bluetooth: manages the connection, tracks the cube
 * state live, and emits events for the rest of the app.
 *
 * Needs Web Bluetooth, so Chrome or Edge on desktop or Android. Safari and iOS
 * do not support it (short of using the Bluefy browser).
 */

import { connectGanCube, cubeTimestampLinearFit, type GanCubeConnection, type GanCubeEvent, type GanCubeMove } from 'gan-web-bluetooth';
import { SOLVED_STATE, applyMove, fromKociemba, toKociemba, isKnownMove, isPlausibleState, isSolved, cloneState, type CubeState } from '../cube/cube';
import { MAC_STORAGE_KEY, normalizeMac } from './mac';
import { isFreshSerial } from './serial';
import { CommandBudget, notifyAll } from './dispatch';
import { ResetGesture } from './gesture';

export { normalizeMac, savedMacs, forgetMac } from './mac';

export type CubeLinkStatus = 'disconnected' | 'connecting' | 'connected';

/**
 * Where the cube events are coming from.
 *
 * 'bluetooth' is this machine's own radio. 'remote' is a phone in the same room
 * holding the cube and forwarding what it sees — the events are identical, so
 * everything downstream is none the wiser.
 */
export type CubeSource = 'bluetooth' | 'remote';

export interface CubeLogEntry {
  t: number;
  kind: string;
  detail?: string;
}

export interface CubeQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface LiveMove {
  move: string;
  /** Timestamp from the host clock (ms) */
  localTs: number;
  /** Timestamp from the cube's own clock, more accurate; null when missing */
  cubeTs: number | null;
  raw: GanCubeMove;
}

type Listener = {
  move?: (m: LiveMove, state: CubeState) => void;
  /** The four-D gesture was made and the cube has been told it is solved */
  resetGesture?: () => void;
  /**
   * Every event exactly as the cube reported it, before any interpretation.
   * Used by a phone bridging to a computer, which forwards them untouched.
   */
  raw?: (e: GanCubeEvent) => void;
  /** The data read back is garbage — almost certainly a wrong MAC address */
  garbled?: () => void;
  state?: (s: CubeState, fromCube: boolean) => void;
  status?: (s: CubeLinkStatus, info: CubeInfo | null) => void;
  battery?: (level: number) => void;
  gyro?: (q: CubeQuaternion) => void;
};

export interface CubeInfo {
  name: string;
  mac: string;
  hardware?: string;
  software?: string;
  gyro?: boolean;
  battery?: number;
}

export class CubeLink {
  private conn: GanCubeConnection | null = null;
  private sub: { unsubscribe(): void } | null = null;
  private listeners = new Set<Listener>();
  private state: CubeState = cloneState(SOLVED_STATE);

  status: CubeLinkStatus = 'disconnected';
  info: CubeInfo | null = null;
  /** The cube's last reported orientation; null if it has no gyroscope */
  lastQuaternion: CubeQuaternion | null = null;
  /** How often the cube reported a state differing from the app's */
  driftCount = 0;
  /** State packets that decrypted to garbage; above 0 means a likely bad MAC */
  garbledCount = 0;
  /** Serial of the last applied move; used to drop stale state snapshots */
  private lastSerial: number | null = null;
  /** Set when the UI can prompt the user for the MAC address */
  askForMac: ((deviceName: string) => Promise<string | null>) | null = null;
  /** True when the link dropped on its own rather than being closed here */
  droppedUnexpectedly = false;
  /** Which radio the events are arriving through, if any */
  source: CubeSource | null = null;
  /** Set while a phone is bridging: where its commands are sent */
  private remoteSend: ((type: string) => void) | null = null;
  /** Recent events, for working out what happened when something goes wrong */
  readonly log: CubeLogEntry[] = [];
  /**
   * Every command is a GATT write to the cube, and a cube written to several
   * times a second can drop the link outright. Idle polling therefore has to
   * stay calm: at most one request every 1.5s, and only a few in a row before
   * giving up until the cube does something again.
   */
  private budget = new CommandBudget(1500, 4);
  /** Four turns of D in a row means "this cube is solved, take my word for it" */
  private gesture = new ResetGesture();

  private note(kind: string, detail?: string) {
    this.log.push({ t: Date.now(), kind, detail });
    if (this.log.length > 120) this.log.shift();
  }

  /**
   * Call every listener, and never let one of them take the others down.
   *
   * These callbacks are React handlers. An exception thrown from one used to
   * escape into the cube's event stream, which is no place for it — a render
   * bug would silently stop every later move from arriving and look exactly
   * like the cube disconnecting.
   */
  private notify(fn: (l: Listener) => void) {
    notifyAll(this.listeners, fn, (err) => this.note('listener-error', (err as Error)?.message ?? String(err)));
  }

  static get supported(): boolean {
    return typeof navigator !== 'undefined' && !!(navigator as Navigator).bluetooth;
  }

  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  getState(): CubeState {
    return this.state;
  }

  private emitStatus() {
    this.notify((l) => l.status?.(this.status, this.info));
  }

  async connect(): Promise<void> {
    if (this.status !== 'disconnected') return;
    if (!CubeLink.supported) throw new Error('This browser does not support Web Bluetooth. Use Chrome or Edge.');
    this.status = 'connecting';
    this.droppedUnexpectedly = false;
    this.note('connecting');
    this.emitStatus();
    try {
      const conn = await connectGanCube(async (device, isFallback) => {
        const saved = localStorage.getItem(`${MAC_STORAGE_KEY}.${device.name ?? device.id ?? 'cube'}`);
        if (saved) return saved;
        if (!isFallback) return null; // let the library try to detect it first
        const entered = this.askForMac ? await this.askForMac(device.name ?? 'cube') : null;
        const mac = entered ? normalizeMac(entered) : null;
        if (mac) localStorage.setItem(`${MAC_STORAGE_KEY}.${device.name ?? device.id ?? 'cube'}`, mac);
        return mac;
      });
      this.conn = conn;
      this.info = { name: conn.deviceName, mac: conn.deviceMAC };
      this.sub = conn.events$.subscribe((e) => this.handle(e));
      this.status = 'connected';
      this.source = 'bluetooth';
      this.budget.refill(performance.now());
      this.note('connected', `${conn.deviceName} ${conn.deviceMAC}`);
      this.emitStatus();
      await conn.sendCubeCommand({ type: 'REQUEST_HARDWARE' });
      await conn.sendCubeCommand({ type: 'REQUEST_BATTERY' });
      await conn.sendCubeCommand({ type: 'REQUEST_FACELETS' });
    } catch (err) {
      this.status = 'disconnected';
      this.note('connect-failed', (err as Error)?.message ?? String(err));
      this.emitStatus();
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.note('disconnect-requested');
    this.droppedUnexpectedly = false;
    this.sub?.unsubscribe();
    this.sub = null;
    await this.conn?.disconnect().catch(() => {});
    this.conn = null;
    this.remoteSend = null;
    this.source = null;
    this.status = 'disconnected';
    this.info = null;
    this.emitStatus();
  }

  /* ---------------- a phone acting as the radio ---------------- */

  /**
   * Take over the link with a phone on the other end.
   *
   * `send` is how a command reaches the cube from here: it goes to the phone,
   * which passes it on. Nothing else changes — the events that come back are
   * the cube's own, so the rest of the app cannot tell the difference.
   */
  attachRemote(send: (type: string) => void) {
    this.remoteSend = send;
    this.source = 'remote';
    this.droppedUnexpectedly = false;
    this.note('remote-attached');
  }

  /** The phone says its cube connected, changed, or went away. */
  setRemoteCube(info: CubeInfo | null) {
    if (this.source !== 'remote') return;
    this.info = info;
    this.status = info ? 'connected' : 'connecting';
    this.budget.refill(performance.now());
    this.note(info ? 'remote-cube' : 'remote-cube-gone', info ? `${info.name} ${info.mac}` : undefined);
    this.emitStatus();
  }

  /** An event forwarded from the phone, handled exactly like a local one. */
  acceptRemoteEvent(e: GanCubeEvent) {
    if (this.source !== 'remote') return;
    this.handle(e);
  }

  /** Give the link back; the phone has stopped bridging. */
  detachRemote() {
    if (this.source !== 'remote') return;
    this.remoteSend = null;
    this.source = null;
    this.status = 'disconnected';
    this.info = null;
    this.note('remote-detached');
    this.emitStatus();
  }

  /** Send a command to the cube, wherever it happens to be. */
  private async command(type: 'REQUEST_FACELETS' | 'REQUEST_RESET' | 'REQUEST_BATTERY' | 'REQUEST_HARDWARE') {
    if (this.source === 'remote') {
      this.remoteSend?.(type);
      return;
    }
    await this.conn?.sendCubeCommand({ type }).catch((err) => {
      this.note('command-failed', (err as Error)?.message ?? String(err));
    });
  }

  /**
   * Ask the cube to report its real state. The serial marker is cleared first:
   * this is a request the user deliberately made, so the answer must always be
   * accepted, even if the stale-packet filter would otherwise reject it.
   */
  async resync(): Promise<void> {
    this.lastSerial = null;
    this.gesture.reset();
    this.budget.spendFreely(performance.now());
    this.note('resync');
    await this.command('REQUEST_FACELETS');
  }

  /**
   * Ask the cube what it is showing, but only if we have not just asked.
   *
   * Used by the timer to catch a dropped final move. It has to be rate limited:
   * this fires from a timer while the hands are still, and hammering the cube
   * with writes is a good way to lose the link altogether. The budget refills
   * on the next move.
   */
  async pollState(): Promise<void> {
    if (this.status !== 'connected') return;
    if (!this.conn && this.source !== 'remote') return;
    if (!this.budget.take(performance.now())) return;
    await this.command('REQUEST_FACELETS');
  }

  /** Wait for the next state packet from the cube, or time out. */
  private nextState(timeoutMs = 1200): Promise<CubeState | null> {
    return new Promise((resolve) => {
      let done = false;
      const off = this.on({
        state: (s, fromCube) => {
          if (done || !fromCube) return;
          done = true;
          off();
          resolve(s);
        },
      });
      setTimeout(() => {
        if (done) return;
        done = true;
        off();
        resolve(null);
      }, timeoutMs);
    });
  }

  get connected(): boolean {
    return this.status === 'connected';
  }

  /**
   * Tell the cube that its current position is the solved state.
   *
   * This is the only cure when THE CUBE ITSELF is wrong (you took it apart, or
   * it missed one of its own turns) — asking it again just returns the same
   * wrong answer. After resetting we ask again to confirm the cube really took
   * it, rather than blindly reporting success.
   *
   * @returns true if the cube confirms it is solved
   */
  async resetToSolved(): Promise<boolean> {
    if (this.source === 'remote') {
      this.note('reset');
      this.budget.spendFreely(performance.now());
      this.lastSerial = null;
      const pending = this.nextState();
      this.remoteSend?.('REQUEST_RESET');
      this.remoteSend?.('REQUEST_FACELETS');
      const confirmed = await pending;
      if (confirmed) return isSolved(confirmed);
      this.setState(cloneState(SOLVED_STATE), true);
      return true;
    }
    if (!this.conn) {
      this.lastSerial = null;
      this.setState(cloneState(SOLVED_STATE), true);
      return true;
    }
    this.note('reset');
    this.budget.spendFreely(performance.now());
    await this.conn.sendCubeCommand({ type: 'REQUEST_RESET' });
    this.lastSerial = null;
    this.setState(cloneState(SOLVED_STATE), true);

    const pending = this.nextState();
    await this.conn.sendCubeCommand({ type: 'REQUEST_FACELETS' });
    const confirmed = await pending;
    if (!confirmed) return isSolved(this.state); // no answer; trust the local reset
    return isSolved(confirmed);
  }

  private setState(s: CubeState, fromCube: boolean) {
    this.state = s;
    this.notify((l) => l.state?.(s, fromCube));
  }

  /**
   * Nothing in here may throw.
   *
   * This runs inside the cube's own event stream. An exception escaping it does
   * not just lose one event — it stops the ones after it, and from the outside
   * that is indistinguishable from the cube disconnecting. Every branch below is
   * therefore written to fail quietly and write down what happened.
   */
  private handle(e: GanCubeEvent) {
    try {
      this.dispatch(e);
    } catch (err) {
      this.note('event-error', `${e?.type}: ${(err as Error)?.message ?? String(err)}`);
    }
  }

  private dispatch(e: GanCubeEvent) {
    this.notify((l) => l.raw?.(e));
    switch (e.type) {
      case 'MOVE': {
        // A corrupted packet can decode to a face outside 0-5, and the library
        // turns that into an empty move string. Applying it would throw.
        if (!isKnownMove(e.move)) {
          // A move we cannot read is a move we cannot apply, so the model is
          // now behind the cube by one turn. Ask the cube what it is actually
          // showing rather than carrying on from a state we know is wrong.
          this.note('bad-move', JSON.stringify(e.move));
          this.driftCount++;
          void this.pollState();
          break;
        }
        this.lastSerial = e.serial;
        this.budget.refill(performance.now());
        this.state = applyMove(this.state, e.move);
        // Four quarter turns of D leave the cube untouched, so this can be
        // checked before anything else without changing what the move does.
        const at = e.localTimestamp ?? e.timestamp;
        if (this.gesture.push(e.move, Number.isFinite(at) ? at : performance.now())) {
          this.note('reset-gesture');
          this.notify((l) => l.resetGesture?.());
          void this.resetToSolved();
        }
        const lm: LiveMove = {
          move: e.move,
          localTs: e.localTimestamp ?? e.timestamp,
          cubeTs: e.cubeTimestamp,
          raw: e,
        };
        this.note('move', `${e.move} #${e.serial}`);
        this.notify((l) => l.move?.(lm, this.state));
        this.notify((l) => l.state?.(this.state, false));
        break;
      }
      case 'FACELETS': {
        let truth: CubeState | null = null;
        try {
          truth = fromKociemba(e.facelets);
        } catch {
          truth = null;
        }
        if (!truth || !isPlausibleState(truth)) {
          // Decrypted to garbage: the key is wrong, so the MAC was mistyped.
          this.garbledCount++;
          this.note('garbled');
          this.notify((l) => l.garbled?.());
          break;
        }
        // Drop snapshots older than the last applied move, or the app's state
        // gets dragged backwards (see smartcube/serial.ts).
        if (!isFreshSerial(e.serial, this.lastSerial)) break;
        this.lastSerial = e.serial;
        // The cube is the source of truth. A mismatch means bluetooth dropped a
        // move, so count it and let the UI warn about it.
        if (toKociemba(this.state) !== e.facelets) this.driftCount++;
        this.setState(truth, true);
        break;
      }
      case 'GYRO':
        this.lastQuaternion = e.quaternion;
        this.notify((l) => l.gyro?.(e.quaternion));
        break;
      case 'BATTERY':
        if (this.info) this.info.battery = e.batteryLevel;
        this.note('battery', `${e.batteryLevel}%`);
        this.notify((l) => l.battery?.(e.batteryLevel));
        this.emitStatus();
        break;
      case 'HARDWARE':
        if (this.info) {
          this.info.hardware = e.hardwareName;
          this.info.software = e.softwareVersion;
          this.info.gyro = e.gyroSupported;
        }
        this.note('hardware', `${e.hardwareName} ${e.softwareVersion}`);
        this.emitStatus();
        break;
      case 'DISCONNECT':
        // The browser fired gattserverdisconnected: the radio link itself is
        // gone. Nothing in the app can close it, so reaching here while still
        // in use means the cube or the link gave up.
        this.note('DISCONNECTED BY CUBE');
        this.droppedUnexpectedly = true;
        this.status = 'disconnected';
        this.info = null;
        this.conn = null;
        this.emitStatus();
        break;
    }
  }
}

/**
 * Fit a run of move timestamps by linear regression between the cube's clock
 * and the host clock, then rebase so the first move is at zero.
 */
export function normalizeTimestamps(moves: LiveMove[]): { move: string; t: number }[] {
  if (!moves.length) return [];
  let ts: number[];
  try {
    const fitted = cubeTimestampLinearFit(moves.map((m) => m.raw));
    ts = fitted.map((m, i) => m.cubeTimestamp ?? moves[i].localTs);
  } catch {
    ts = moves.map((m) => m.cubeTs ?? m.localTs);
  }
  if (ts.some((t) => typeof t !== 'number' || !isFinite(t))) ts = moves.map((m) => m.localTs);
  const t0 = ts[0];
  return moves.map((m, i) => ({ move: m.move, t: Math.max(0, ts[i] - t0) }));
}

export const cubeLink = new CubeLink();
