/** Local storage via IndexedDB — all data stays on your machine. */

import Dexie, { type Table } from 'dexie';
import type { TimedMove } from '../cube/moveStream';
import type { MethodName } from '../analysis/method';
import { SEED_ALGS } from '../data/seedAlgs';

export type Penalty = 'none' | '+2' | 'DNF';

export interface Session {
  id?: number;
  name: string;
  method: MethodName | 'auto';
  createdAt: number;
}

export interface Solve {
  id?: number;
  sessionId: number;
  date: number;
  scramble: string;
  /** Raw time before penalties (ms) */
  timeMs: number;
  penalty: Penalty;
  source: 'smartcube' | 'manual';
  /** Empty for hand-timed solves */
  moves: TimedMove[];
  comment?: string;
}

export interface AlgEntry {
  id?: number;
  /** Broad set: CMLL, LSE, PLL, ... */
  group: string;
  /** Case family, e.g. Sune, Anti-Sune, EOLR — the level the user opens first */
  family: string;
  /** The specific case within the family */
  name: string;
  alg: string;
  createdAt: number;
  notes?: string;
}

export interface Rep {
  id?: number;
  algId: number;
  date: number;
  recognitionMs: number;
  execMs: number;
  moveTimes: (number | null)[];
  extraMoves: number;
  success: boolean;
}

export interface Setting {
  key: string;
  value: unknown;
}

class TrainerDB extends Dexie {
  sessions!: Table<Session, number>;
  solves!: Table<Solve, number>;
  algs!: Table<AlgEntry, number>;
  reps!: Table<Rep, number>;
  settings!: Table<Setting, string>;

  constructor() {
    super('speedcube-trainer');
    this.version(1).stores({
      sessions: '++id, name, createdAt',
      solves: '++id, sessionId, date',
      algs: '++id, group, name, createdAt',
      reps: '++id, algId, date',
      settings: 'key',
    });
    // The alg library gained a "family" level so it stays usable with hundreds
    // of algs. Older algs without one simply take their own name as the family.
    this.version(2)
      .stores({
        sessions: '++id, name, createdAt',
        solves: '++id, sessionId, date',
        algs: '++id, group, family, name, createdAt',
        reps: '++id, algId, date',
        settings: 'key',
      })
      .upgrade((tx) =>
        tx
          .table<AlgEntry>('algs')
          .toCollection()
          .modify((a) => {
            if (a.family) return;
            // Refile the old seed algs under the new families; for algs the user
            // added themselves, use the name as the family rather than guessing.
            const seed = SEED_ALGS.find((x) => x.alg === a.alg);
            if (seed) {
              a.group = seed.group;
              a.family = seed.family;
              a.name = seed.name;
            } else {
              a.family = a.name;
            }
          }),
      );
  }
}

export const db = new TrainerDB();

export async function ensureDefaultSession(): Promise<number> {
  const first = await db.sessions.orderBy('createdAt').first();
  if (first?.id) {
    // The default session used to be named in Vietnamese. Rename it so no part
    // of the app is left in the old language; a session someone named
    // themselves is left alone.
    if (first.name === 'Phiên chính') await db.sessions.update(first.id, { name: 'Main session' });
    return first.id;
  }
  return db.sessions.add({ name: 'Main session', method: 'roux', createdAt: Date.now() });
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

export interface BackupFile {
  app: 'speedcube-trainer';
  version: 1;
  exportedAt: number;
  sessions: Session[];
  solves: Solve[];
  algs: AlgEntry[];
  reps: Rep[];
  settings: Setting[];
}

export async function exportAll(): Promise<BackupFile> {
  const [sessions, solves, algs, reps, settings] = await Promise.all([
    db.sessions.toArray(), db.solves.toArray(), db.algs.toArray(), db.reps.toArray(), db.settings.toArray(),
  ]);
  return { app: 'speedcube-trainer', version: 1, exportedAt: Date.now(), sessions, solves, algs, reps, settings };
}

/** Import data, REPLACING everything currently stored. */
export async function importAll(data: BackupFile): Promise<void> {
  if (data.app !== 'speedcube-trainer') throw new Error('That is not a valid backup file.');
  await db.transaction('rw', db.sessions, db.solves, db.algs, db.reps, db.settings, async () => {
    await Promise.all([db.sessions.clear(), db.solves.clear(), db.algs.clear(), db.reps.clear(), db.settings.clear()]);
    await db.sessions.bulkAdd(data.sessions);
    await db.solves.bulkAdd(data.solves);
    await db.algs.bulkAdd(data.algs);
    await db.reps.bulkAdd(data.reps);
    await db.settings.bulkAdd(data.settings);
  });
}
