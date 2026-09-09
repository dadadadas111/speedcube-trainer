/** Lưu trữ cục bộ bằng IndexedDB — toàn bộ dữ liệu nằm trên máy bạn. */

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
  /** Thời gian thô, chưa cộng phạt (ms) */
  timeMs: number;
  penalty: Penalty;
  source: 'smartcube' | 'manual';
  /** Rỗng nếu bấm giờ bằng tay */
  moves: TimedMove[];
  comment?: string;
}

export interface AlgEntry {
  id?: number;
  /** Mảng lớn: CMLL, LSE, PLL... */
  group: string;
  /** Họ case, ví dụ Sune, Anti-Sune, EOLR — đây là tầng người dùng bấm vào trước */
  family: string;
  /** Tên case cụ thể trong họ */
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
    // Thư viện alg tách thêm một tầng "họ" để còn dùng được khi có hàng trăm alg.
    // Alg cũ chưa có họ thì lấy luôn tên nó làm họ.
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
            // Alg mẫu cũ thì xếp lại theo họ mới; alg người dùng tự thêm thì lấy
            // luôn tên nó làm họ, không đoán hộ.
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
  if (first?.id) return first.id;
  return db.sessions.add({ name: 'Phiên chính', method: 'roux', createdAt: Date.now() });
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

/** Nhập dữ liệu, GHI ĐÈ toàn bộ dữ liệu hiện có. */
export async function importAll(data: BackupFile): Promise<void> {
  if (data.app !== 'speedcube-trainer') throw new Error('File sao lưu không đúng định dạng.');
  await db.transaction('rw', db.sessions, db.solves, db.algs, db.reps, db.settings, async () => {
    await Promise.all([db.sessions.clear(), db.solves.clear(), db.algs.clear(), db.reps.clear(), db.settings.clear()]);
    await db.sessions.bulkAdd(data.sessions);
    await db.solves.bulkAdd(data.solves);
    await db.algs.bulkAdd(data.algs);
    await db.reps.bulkAdd(data.reps);
    await db.settings.bulkAdd(data.settings);
  });
}
