/** Shared app state: sessions, settings, and cube connection status. */

import { create } from 'zustand';
import { db, ensureDefaultSession, getSetting, setSetting, type Session, removeSynced } from './db';
import type { MethodName } from '../analysis/method';
import { cubeLink, type CubeLinkStatus, type CubeInfo } from '../smartcube/connection';
import { SOLVED_STATE, cloneState, type CubeState } from '../cube/cube';

export interface Settings {
  method: MethodName | 'auto';
  useInspection: boolean;
  inspectionSeconds: number;
  randomStateScramble: boolean;
  /** Minimum gap that counts as a pause (ms) */
  pauseMinMs: number;
  /** ...and it must exceed this multiple of the median gap between moves */
  pauseFactor: number;
  /** Target average time (ms), used to scale the advice */
  targetMs: number;
  /** Require the cube to match the scramble before the timer arms */
  requireScrambleMatch: boolean;
  /** Use the keyboard cube instead of a smart cube, for trying things out */
  keyboardCube: boolean;
  /** How to draw the cube: rotatable 3D, or a flat net showing all 6 faces */
  cubeView: '3d' | 'net';
  /** Let the on-screen cube follow the real cube's gyroscope */
  useGyro: boolean;
  /**
   * What the timer is for right now.
   *
   * 'speed' is an ordinary timed solve. 'slow' is deliberate practice: the
   * clock still runs and is recorded, but the screen shows the move count
   * instead, and the review talks about the shape of the solution rather than
   * how long it took — because watching a clock is the surest way to stop
   * thinking about efficiency.
   */
  timerMode: 'speed' | 'slow';
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
  timerMode: 'speed',
};

interface AppState {
  ready: boolean;
  sessions: Session[];
  sessionId: number;
  settings: Settings;
  cubeStatus: CubeLinkStatus;
  cubeInfo: CubeInfo | null;
  cubeState: CubeState;
  /** Bumped whenever a solve or alg changes, so pages reload themselves */
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
    await removeSynced('sessions', id);
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
