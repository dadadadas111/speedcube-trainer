/**
 * Lớp bọc quanh gan-web-bluetooth: quản lý kết nối, theo dõi trạng thái khối
 * theo thời gian thực và phát sự kiện cho phần còn lại của app.
 *
 * Yêu cầu Web Bluetooth -> Chrome/Edge trên desktop hoặc Android. Safari và
 * iOS không hỗ trợ (trừ khi dùng trình duyệt Bluefy).
 */

import { connectGanCube, cubeTimestampLinearFit, type GanCubeConnection, type GanCubeEvent, type GanCubeMove } from 'gan-web-bluetooth';
import { SOLVED_STATE, applyMove, fromKociemba, toKociemba, isPlausibleState, isSolved, cloneState, type CubeState } from '../cube/cube';
import { MAC_STORAGE_KEY, normalizeMac } from './mac';
import { isFreshSerial } from './serial';

export { normalizeMac, savedMacs, forgetMac } from './mac';

export type CubeLinkStatus = 'disconnected' | 'connecting' | 'connected';

export interface CubeQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface LiveMove {
  move: string;
  /** Mốc thời gian theo đồng hồ máy (ms) */
  localTs: number;
  /** Mốc thời gian theo đồng hồ trong cube (chính xác hơn), null nếu thiếu */
  cubeTs: number | null;
  raw: GanCubeMove;
}

type Listener = {
  move?: (m: LiveMove, state: CubeState) => void;
  /** Dữ liệu đọc về là rác — gần như chắc chắn do địa chỉ MAC sai */
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
  /** Hướng cube báo về lần gần nhất, null nếu cube không có con quay */
  lastQuaternion: CubeQuaternion | null = null;
  /** Số lần cube gửi về trạng thái khác với trạng thái app đang giữ */
  driftCount = 0;
  /** Số gói trạng thái giải mã ra rác; >0 nghĩa là MAC nhiều khả năng sai */
  garbledCount = 0;
  /** Số thứ tự của nước cuối cùng đã áp; dùng để bỏ qua ảnh chụp trạng thái cũ */
  private lastSerial: number | null = null;
  /** Đặt true khi người dùng cho phép hỏi tay địa chỉ MAC */
  askForMac: ((deviceName: string) => Promise<string | null>) | null = null;

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
    for (const l of this.listeners) l.status?.(this.status, this.info);
  }

  async connect(): Promise<void> {
    if (this.status !== 'disconnected') return;
    if (!CubeLink.supported) throw new Error('Trình duyệt này không hỗ trợ Web Bluetooth. Hãy dùng Chrome hoặc Edge.');
    this.status = 'connecting';
    this.emitStatus();
    try {
      const conn = await connectGanCube(async (device, isFallback) => {
        const saved = localStorage.getItem(`${MAC_STORAGE_KEY}.${device.name ?? device.id ?? 'cube'}`);
        if (saved) return saved;
        if (!isFallback) return null; // để thư viện tự dò trước
        const entered = this.askForMac ? await this.askForMac(device.name ?? 'cube') : null;
        const mac = entered ? normalizeMac(entered) : null;
        if (mac) localStorage.setItem(`${MAC_STORAGE_KEY}.${device.name ?? device.id ?? 'cube'}`, mac);
        return mac;
      });
      this.conn = conn;
      this.info = { name: conn.deviceName, mac: conn.deviceMAC };
      this.sub = conn.events$.subscribe((e) => this.handle(e));
      this.status = 'connected';
      this.emitStatus();
      await conn.sendCubeCommand({ type: 'REQUEST_HARDWARE' });
      await conn.sendCubeCommand({ type: 'REQUEST_BATTERY' });
      await conn.sendCubeCommand({ type: 'REQUEST_FACELETS' });
    } catch (err) {
      this.status = 'disconnected';
      this.emitStatus();
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.sub?.unsubscribe();
    this.sub = null;
    await this.conn?.disconnect().catch(() => {});
    this.conn = null;
    this.status = 'disconnected';
    this.info = null;
    this.emitStatus();
  }

  /**
   * Yêu cầu cube gửi lại trạng thái thật. Xoá mốc số thứ tự trước khi hỏi, vì
   * đây là yêu cầu do người dùng chủ động bấm nên câu trả lời phải luôn được
   * nhận, kể cả khi bộ lọc gói cũ tưởng nhầm là lạc hậu.
   */
  async resync(): Promise<void> {
    this.lastSerial = null;
    await this.conn?.sendCubeCommand({ type: 'REQUEST_FACELETS' });
  }

  /** Chờ gói trạng thái kế tiếp từ cube, hoặc hết giờ. */
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
   * Báo cho cube biết vị trí hiện tại của nó chính là trạng thái đã giải.
   *
   * Đây là cách duy nhất chữa được khi CHÍNH CUBE nhớ sai (bạn tháo lắp, hoặc
   * nó bỏ sót nước của chính nó) — lúc đó hỏi lại cube bao nhiêu lần cũng chỉ
   * nhận về đúng cái sai đó. Sau khi đặt lại thì hỏi lại để xác nhận cube đã
   * thật sự nhận, thay vì báo thành công một cách mù quáng.
   *
   * @returns true nếu cube xác nhận đang ở trạng thái đã giải
   */
  async resetToSolved(): Promise<boolean> {
    if (!this.conn) {
      this.lastSerial = null;
      this.setState(cloneState(SOLVED_STATE), true);
      return true;
    }
    await this.conn.sendCubeCommand({ type: 'REQUEST_RESET' });
    this.lastSerial = null;
    this.setState(cloneState(SOLVED_STATE), true);

    const pending = this.nextState();
    await this.conn.sendCubeCommand({ type: 'REQUEST_FACELETS' });
    const confirmed = await pending;
    if (!confirmed) return isSolved(this.state); // cube không trả lời, tạm tin bản đặt lại
    return isSolved(confirmed);
  }

  private setState(s: CubeState, fromCube: boolean) {
    this.state = s;
    for (const l of this.listeners) l.state?.(s, fromCube);
  }

  private handle(e: GanCubeEvent) {
    switch (e.type) {
      case 'MOVE': {
        this.lastSerial = e.serial;
        this.state = applyMove(this.state, e.move);
        const lm: LiveMove = {
          move: e.move,
          localTs: e.localTimestamp ?? e.timestamp,
          cubeTs: e.cubeTimestamp,
          raw: e,
        };
        for (const l of this.listeners) l.move?.(lm, this.state);
        for (const l of this.listeners) l.state?.(this.state, false);
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
          // Giải mã ra rác: khoá mã hoá sai, tức là MAC nhập sai.
          this.garbledCount++;
          for (const l of this.listeners) l.garbled?.();
          break;
        }
        // Ảnh chụp trạng thái cũ hơn nước đã áp thì bỏ qua, nếu không sẽ kéo lùi
        // trạng thái của app (xem smartcube/serial.ts).
        if (!isFreshSerial(e.serial, this.lastSerial)) break;
        this.lastSerial = e.serial;
        // Cube là nguồn sự thật. Nếu lệch thì đã có nước bị rớt qua bluetooth —
        // đếm lại để giao diện còn cảnh báo người dùng.
        if (toKociemba(this.state) !== e.facelets) this.driftCount++;
        this.setState(truth, true);
        break;
      }
      case 'GYRO':
        this.lastQuaternion = e.quaternion;
        for (const l of this.listeners) l.gyro?.(e.quaternion);
        break;
      case 'BATTERY':
        if (this.info) this.info.battery = e.batteryLevel;
        for (const l of this.listeners) l.battery?.(e.batteryLevel);
        this.emitStatus();
        break;
      case 'HARDWARE':
        if (this.info) {
          this.info.hardware = e.hardwareName;
          this.info.software = e.softwareVersion;
          this.info.gyro = e.gyroSupported;
        }
        this.emitStatus();
        break;
      case 'DISCONNECT':
        this.status = 'disconnected';
        this.info = null;
        this.conn = null;
        this.emitStatus();
        break;
    }
  }
}

/**
 * Hiệu chỉnh mốc thời gian của một loạt nước bằng hồi quy tuyến tính giữa đồng
 * hồ trong cube và đồng hồ máy, rồi quy về mốc 0 tại nước đầu tiên.
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
