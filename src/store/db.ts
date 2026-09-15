/** Local storage via IndexedDB — all data stays on your machine. */

import Dexie, { type Table } from 'dexie';
import type { TimedMove } from '../cube/moveStream';
import type { MethodName } from '../analysis/method';
import { SEED_ALGS, RETIRED_CMLL_ALGS } from '../data/seedAlgs';

export type Penalty = 'none' | '+2' | 'DNF';

/**
 * What every record that syncs carries.
 *
 * `uid` is the identity that means the same thing on two devices — the local
 * `id` is an auto-increment and would collide the moment a phone and a laptop
 * both recorded a solve. `updatedAt` is how a merge decides which of two
 * versions is the newer intention.
 */
export interface Synced {
  uid?: string;
  updatedAt?: number;
}

export interface Session extends Synced {
  id?: number;
  name: string;
  method: MethodName | 'auto';
  createdAt: number;
  /**
   * Whether this session's solves belong in the statistics.
   *
   * A session for deliberately slow, move-efficient solving is real practice
   * and worth keeping, but averaging it in with timed solves describes neither.
   * Missing means yes, so nothing already recorded has to be touched.
   */
  countsForStats?: boolean;
}

export interface Solve extends Synced {
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

export interface AlgEntry extends Synced {
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

export interface Rep extends Synced {
  id?: number;
  algId: number;
  date: number;
  recognitionMs: number;
  execMs: number;
  moveTimes: (number | null)[];
  extraMoves: number;
  success: boolean;
}

/**
 * A record that was deleted, kept so the other device hears about it.
 *
 * A row that has simply gone is indistinguishable from one the other device
 * has not been told about yet, so without these a delete would be undone by
 * the next sync — the other device would helpfully hand it back.
 */
export interface Tombstone {
  uid: string;
  table: string;
  deletedAt: number;
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
  tombstones!: Table<Tombstone, string>;

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
    /**
     * CMLL went from eight sample algorithms to the whole set of forty-two.
     *
     * A library with eight of them cannot drill CMLL — you meet a case, it is
     * not there, and the mode has nothing to say. The eight that were seeded
     * are retired by exact match so that anything you typed in yourself, CMLL
     * or not, is left exactly where it is. Their reps go with them: a rep
     * pointing at an algorithm that no longer exists is a row nothing can ever
     * read again.
     */
    this.version(3)
      .stores({
        sessions: '++id, name, createdAt',
        solves: '++id, sessionId, date',
        algs: '++id, group, family, name, createdAt',
        reps: '++id, algId, date',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        const algs = tx.table<AlgEntry>('algs');
        const reps = tx.table<Rep>('reps');
        const retired = await algs.filter((a) => a.group === 'CMLL' && RETIRED_CMLL_ALGS.includes(a.alg)).toArray();
        const ids = retired.map((a) => a.id).filter((id): id is number => id != null);
        if (ids.length) {
          await reps.where('algId').anyOf(ids).delete();
          await algs.bulkDelete(ids);
        }
        // Only what is missing, so an upgrade run twice adds nothing twice
        const have = new Set((await algs.toArray()).map((a) => a.alg));
        const wanted = SEED_ALGS.filter((a) => a.group === 'CMLL' && !have.has(a.alg));
        if (wanted.length) await algs.bulkAdd(wanted.map((a) => ({ ...a, createdAt: Date.now() })));
      });
    /**
     * Sessions can be left out of the statistics.
     *
     * Nothing is written by this upgrade: an absent flag already means "counts",
     * which is what every session that existed before was doing. Only the ones
     * you deliberately turn off ever get the field.
     */
    this.version(4).stores({
      sessions: '++id, name, createdAt',
      solves: '++id, sessionId, date',
      algs: '++id, group, family, name, createdAt',
      reps: '++id, algId, date',
      settings: 'key',
    });

    /**
     * Everything gains an identity that survives leaving this browser.
     *
     * The auto-increment ids stay as the local primary keys, because half the
     * app is written against them and a rename would be a large change for no
     * gain. What is added is a `uid` beside them: a phone and a laptop both
     * hand out id 7, and only one of the two can keep it, so the id cannot be
     * what a record IS. The upgrade gives every row that already exists one.
     */
    this.version(5)
      .stores({
        sessions: '++id, &uid, name, createdAt, updatedAt',
        solves: '++id, &uid, sessionId, date, updatedAt',
        algs: '++id, &uid, group, family, name, createdAt, updatedAt',
        reps: '++id, &uid, algId, date, updatedAt',
        settings: 'key',
        tombstones: 'uid, table, deletedAt',
      })
      .upgrade(async (tx) => {
        const now = Date.now();
        for (const name of ['sessions', 'solves', 'algs', 'reps'] as const) {
          await tx
            .table(name)
            .toCollection()
            .modify((row: Synced & { date?: number; createdAt?: number }) => {
              row.uid ??= newUid();
              // Backdate to when the record was made, so a first sync does not
              // look like the entire history changed one second ago
              row.updatedAt ??= row.date ?? row.createdAt ?? now;
            });
        }
      });

    this.stampWrites();
  }

  /**
   * Keep `uid` and `updatedAt` right without every caller remembering to.
   *
   * There are sixteen places that write one of these tables and there will be
   * more; asking each of them to stamp two fields is a rule that gets forgotten
   * once and then quietly breaks syncing for one kind of record. The hooks make
   * it true by construction.
   */
  private stampWrites() {
    for (const table of [this.sessions, this.solves, this.algs, this.reps]) {
      table.hook('creating', (_key, obj: Synced) => {
        obj.uid ??= newUid();
        obj.updatedAt ??= Date.now();
      });
      table.hook('updating', (mods: Partial<Synced>, _key, obj: Synced) => {
        // A write that carries its own updatedAt is the sync applying something
        // from the other device; stamping it now would make it look local and
        // newer than it is, and it would bounce back on the next push.
        if (mods.updatedAt !== undefined) return;
        return { updatedAt: Date.now(), uid: obj.uid ?? newUid() };
      });
    }
  }
}

/** Identity that two devices cannot both invent. */
export function newUid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Old browsers, and node while testing
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Delete a record and leave a mark saying so.
 *
 * Both halves in one transaction: a delete without its tombstone is a delete
 * the other device will undo, and a tombstone without its delete is a record
 * that vanishes from one device and not the other.
 */
export async function removeSynced(
  table: 'sessions' | 'solves' | 'algs' | 'reps',
  id: number,
): Promise<void> {
  await db.transaction('rw', db[table], db.tombstones, async () => {
    const row = (await db[table].get(id)) as Synced | undefined;
    if (row?.uid) await db.tombstones.put({ uid: row.uid, table, deletedAt: Date.now() });
    await db[table].delete(id);
  });
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
