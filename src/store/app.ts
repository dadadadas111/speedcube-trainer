/** Trạng thái dùng chung của app: phiên, thiết lập, trạng thái kết nối cube. */

import { create } from 'zustand';
import { db, ensureDefaultSession, getSetting, setSetting, type Session } from './db';
import type { MethodName } from '../analysis/method';
import { cubeLink, type CubeLinkStatus, type CubeInfo } from '../smartcube/connection';
import { SOLVED_STATE, cloneState, type CubeState } from '../cube/cube';

export interface Settings {
  method: MethodName | 'auto';
  useInspection: boolean;
  inspectionSeconds: number;
  randomStateScramble: boolean;
  /** Ngưỡng tối thiểu để tính là một lần dừng tay (ms) */
  pauseMinMs: number;
  /** ...và phải lớn hơn ngần này lần khoảng cách trung vị giữa hai nước */
  pauseFactor: number;
  /** Mục tiêu thời gian trung bình (ms), dùng để định cỡ gợi ý */
  targetMs: number;
  /** Bắt buộc khối phải khớp scramble mới cho bấm giờ */
  requireScrambleMatch: boolean;
  /** Dùng khối ảo bàn phím thay cho smart cube (để dùng thử / kiểm thử) */
  keyboardCube: boolean;
  /** Kiểu vẽ khối: 3D xoay được, hay trải phẳng thấy đủ 6 mặt */
  cubeView: '3d' | 'net';
  /** Cho khối trên màn hình xoay theo con quay của cube thật */
  useGyro: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  method: 'roux',
  useInspection: false,
  inspectionSeconds: 15,
  randomStateScramble: true,
  pauseMinMs: 180,
  pauseFactor: 2.2,
  targetMs: 20000,
  requireScrambleMatch: true,
  keyboardCube: false,
  cubeView: '3d',
  useGyro: false,
};

interface AppState {
  ready: boolean;
  sessions: Session[];
  sessionId: number;
  settings: Settings;
  cubeStatus: CubeLinkStatus;
  cubeInfo: CubeInfo | null;
  cubeState: CubeState;
  /** Tăng lên mỗi khi có solve/alg mới, để các trang tự nạp lại */
  revision: number;

  init: () => Promise<void>;
  setSession: (id: number) => Promise<void>;
  addSession: (name: string) => Promise<void>;
  renameSession: (id: number, name: string) => Promise<void>;
  deleteSession: (id: number) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  bump: () => void;
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  sessions: [],
  sessionId: 0,
  settings: DEFAULT_SETTINGS,
  cubeStatus: 'disconnected',
  cubeInfo: null,
  cubeState: cloneState(SOLVED_STATE),
  revision: 0,

  async init() {
    const sessionId = await ensureDefaultSession();
    const [sessions, settings, lastSession] = await Promise.all([
      db.sessions.orderBy('createdAt').toArray(),
      getSetting<Settings>('settings', DEFAULT_SETTINGS),
      getSetting<number>('lastSession', sessionId),
    ]);
    const valid = sessions.some((s) => s.id === lastSession) ? lastSession : sessionId;
    set({
      ready: true,
      sessions,
      sessionId: valid,
      settings: { ...DEFAULT_SETTINGS, ...settings },
    });

    cubeLink.on({
      status: (cubeStatus, cubeInfo) => set({ cubeStatus, cubeInfo: cubeInfo ? { ...cubeInfo } : null }),
      state: (cubeState) => set({ cubeState }),
    });
  },

  async setSession(id) {
    await setSetting('lastSession', id);
    set({ sessionId: id });
  },

  async addSession(name) {
    const id = await db.sessions.add({ name, method: get().settings.method, createdAt: Date.now() });
    set({ sessions: await db.sessions.orderBy('createdAt').toArray() });
    await get().setSession(id);
  },

  async renameSession(id, name) {
    await db.sessions.update(id, { name });
    set({ sessions: await db.sessions.orderBy('createdAt').toArray() });
  },

  async deleteSession(id) {
    await db.solves.where('sessionId').equals(id).delete();
    await db.sessions.delete(id);
    const sessions = await db.sessions.orderBy('createdAt').toArray();
    set({ sessions, revision: get().revision + 1 });
    if (get().sessionId === id) {
      const next = sessions[0]?.id ?? (await ensureDefaultSession());
      set({ sessions: await db.sessions.orderBy('createdAt').toArray() });
      await get().setSession(next);
    }
  },

  async updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    await setSetting('settings', settings);
  },

  bump() {
    set({ revision: get().revision + 1 });
  },
}));
