/**
 * Lớp bọc quanh gan-web-bluetooth: quản lý kết nối, theo dõi trạng thái khối
 * theo thời gian thực và phát sự kiện cho phần còn lại của app.
 *
 * Yêu cầu Web Bluetooth -> Chrome/Edge trên desktop hoặc Android. Safari và
 * iOS không hỗ trợ (trừ khi dùng trình duyệt Bluefy).
 */

import { connectGanCube, cubeTimestampLinearFit, type GanCubeConnection, type GanCubeEvent, type GanCubeMove } from 'gan-web-bluetooth';
import { SOLVED_STATE, applyMove, fromKociemba, toKociemba, cloneState, type CubeState } from '../cube/cube';

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

const MAC_STORAGE_KEY = 'sct.cubeMac';

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
        const saved = localStorage.getItem(`${MAC_STORAGE_KEY}.${device.id ?? device.name ?? 'x'}`);
        if (saved) return saved;
        if (!isFallback) return null; // để thư viện tự dò trước
        const mac = this.askForMac ? await this.askForMac(device.name ?? 'cube') : null;
        if (mac) localStorage.setItem(`${MAC_STORAGE_KEY}.${device.id ?? device.name ?? 'x'}`, mac);
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

  /** Yêu cầu cube gửi lại trạng thái thật (đồng bộ lại nếu lỡ mất nước). */
  async resync(): Promise<void> {
    await this.conn?.sendCubeCommand({ type: 'REQUEST_FACELETS' });
  }

  get connected(): boolean {
    return this.status === 'connected';
  }

  /** Báo cho cube biết trạng thái hiện tại của nó là "đã giải". */
  async resetToSolved(): Promise<void> {
    await this.conn?.sendCubeCommand({ type: 'REQUEST_RESET' });
    this.setState(cloneState(SOLVED_STATE), true);
  }

  private setState(s: CubeState, fromCube: boolean) {
    this.state = s;
    for (const l of this.listeners) l.state?.(s, fromCube);
  }

  private handle(e: GanCubeEvent) {
    switch (e.type) {
      case 'MOVE': {
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
      case 'FACELETS':
        try {
          const truth = fromKociemba(e.facelets);
          // Cube là nguồn sự thật. Nếu lệch thì đã có nước bị rớt qua bluetooth —
          // đếm lại để giao diện còn cảnh báo người dùng.
          if (toKociemba(this.state) !== e.facelets) this.driftCount++;
          this.setState(truth, true);
        } catch {
          /* chuỗi lạ thì bỏ qua */
        }
        break;
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
