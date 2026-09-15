/**
 * Making two devices hold the same history.
 *
 * Push what changed here, pull what changed there, in that order — so a device
 * that has been offline for a week sends its week before being told about
 * everyone else's, and nothing it did is decided against by a merge it has not
 * contributed to yet.
 *
 * The watermarks are deliberately forgiving. `lastRev` is the server's own
 * counter and is exact. `lastPushAt` is a local clock reading, and clocks
 * disagree — so it is rewound slightly on each push, which re-sends a handful
 * of records the server then ignores as not-newer. Re-sending a few is free;
 * missing one because two machines disagreed about a millisecond is not.
 */

import { db, type Tombstone } from '../store/db';
import {
  SYNC_TABLES,
  toRecord,
  toRow,
  tombstoneRecord,
  shouldApply,
  type SyncRecord,
  type SyncTable,
  type LocalRow,
} from './records';

export interface SyncConfig {
  url: string;
  user: string;
  password: string;
}

export interface SyncState {
  lastRev: number;
  lastPushAt: number;
  lastSyncAt: number;
}

const CONFIG_KEY = 'sync.config';
const STATE_KEY = 'sync.state';

/** How far back to look again on each push, to survive clocks disagreeing. */
const CLOCK_SLACK_MS = 60_000;

export async function loadConfig(): Promise<SyncConfig | null> {
  const row = await db.settings.get(CONFIG_KEY);
  const v = row?.value as SyncConfig | undefined;
  return v?.url && v.user ? v : null;
}

export async function saveConfig(config: SyncConfig | null): Promise<void> {
  if (!config) await db.settings.delete(CONFIG_KEY);
  else await db.settings.put({ key: CONFIG_KEY, value: config });
}

export async function loadState(): Promise<SyncState> {
  const row = await db.settings.get(STATE_KEY);
  const v = row?.value as Partial<SyncState> | undefined;
  return { lastRev: v?.lastRev ?? 0, lastPushAt: v?.lastPushAt ?? 0, lastSyncAt: v?.lastSyncAt ?? 0 };
}

async function saveState(state: SyncState): Promise<void> {
  await db.settings.put({ key: STATE_KEY, value: state });
}

/** Forget where we got to, so the next sync takes everything again. */
export async function resetState(): Promise<void> {
  await db.settings.delete(STATE_KEY);
}

const auth = (c: SyncConfig) => 'Basic ' + btoa(`${c.user}:${c.password}`);

async function call(c: SyncConfig, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(c.url.replace(/\/$/, '') + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined
      ? { Authorization: auth(c) }
      : { Authorization: auth(c), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) throw new Error('The user or password is wrong.');
  if (!res.ok) throw new Error(`The server said ${res.status}.`);
  return (await res.json()) as Record<string, unknown>;
}

/** Ask the server whether it is there, and what it is holding. */
export async function checkServer(c: SyncConfig): Promise<{ records: number; rev: number }> {
  const r = await call(c, '/health');
  return { records: Number(r.records ?? 0), rev: Number(r.rev ?? 0) };
}

type Maps = { uidById: Map<SyncTable, Map<number, string>>; idByUid: Map<SyncTable, Map<string, number>> };

/** Both directions of every table's identity, read once per sync. */
async function identityMaps(): Promise<Maps> {
  const uidById = new Map<SyncTable, Map<number, string>>();
  const idByUid = new Map<SyncTable, Map<string, number>>();
  for (const t of SYNC_TABLES) {
    const byId = new Map<number, string>();
    const byUid = new Map<string, number>();
    const rows = (await db[t].toArray()) as unknown as LocalRow[];
    for (const r of rows) {
      if (r.id != null && r.uid) {
        byId.set(r.id, r.uid);
        byUid.set(r.uid, r.id);
      }
    }
    uidById.set(t, byId);
    idByUid.set(t, byUid);
  }
  return { uidById, idByUid };
}

/** Everything changed here since the watermark, ready to send. */
export async function localChanges(since: number): Promise<SyncRecord[]> {
  const maps = await identityMaps();
  const uidOf = (t: SyncTable, id: number) => maps.uidById.get(t)?.get(id);
  const out: SyncRecord[] = [];
  for (const t of SYNC_TABLES) {
    const rows = (await db[t].where('updatedAt').aboveOrEqual(since).toArray()) as unknown as LocalRow[];
    for (const row of rows) {
      const rec = toRecord(t, row, uidOf);
      if (rec) out.push(rec);
    }
  }
  const stones = (await db.tombstones.where('deletedAt').aboveOrEqual(since).toArray()) as Tombstone[];
  for (const s of stones) {
    if ((SYNC_TABLES as readonly string[]).includes(s.table)) {
      out.push(tombstoneRecord(s.table as SyncTable, s.uid, s.deletedAt));
    }
  }
  return out;
}

/**
 * Apply what the server sent.
 *
 * In table order, and parents before children within a table's own batch, so a
 * solve is never stored before the session it belongs to exists here. Anything
 * still unplaceable is left alone rather than guessed at — it arrives on the
 * next sync, once its parent has.
 */
export async function applyRecords(records: SyncRecord[]): Promise<{ applied: number; skipped: number }> {
  let applied = 0;
  let skipped = 0;
  for (const table of SYNC_TABLES) {
    const batch = records.filter((r) => r.table === table);
    if (!batch.length) continue;
    // Re-read between tables: a session added a moment ago has to be findable
    const maps = await identityMaps();
    const idOf = (t: SyncTable, uid: string) => maps.idByUid.get(t)?.get(uid);
    for (const rec of batch) {
      const existing = (await db[table].where('uid').equals(rec.uid).first()) as unknown as LocalRow | undefined;
      if (rec.deleted) {
        // A tombstone older than the row means the record was brought back
        if (existing && shouldApply(rec, existing) && existing.id != null) {
          await db[table].delete(existing.id);
          applied++;
        }
        continue;
      }
      if (!shouldApply(rec, existing)) continue;
      const row = toRow(rec, idOf);
      if (!row) {
        skipped++;
        continue;
      }
      if (existing?.id != null) await db[table].update(existing.id, row as never);
      else {
        await db[table].add(row as never);
        maps.idByUid.get(table)?.set(rec.uid, -1); // presence is what matters here
      }
      applied++;
    }
  }
  return { applied, skipped };
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  applied: number;
  skipped: number;
  rev: number;
}

/**
 * One round: send, then receive.
 *
 * Pulling is repeated while the server says there is more, because a device
 * coming back after a long time can be owed more than one page of history.
 */
export async function syncNow(c: SyncConfig): Promise<SyncResult> {
  const state = await loadState();
  const startedAt = Date.now();

  const outgoing = await localChanges(Math.max(0, state.lastPushAt - CLOCK_SLACK_MS));
  let pushed = 0;
  if (outgoing.length) {
    const r = await call(c, '/push', { records: outgoing });
    pushed = Number(r.applied ?? 0);
  }

  let rev = state.lastRev;
  let pulled = 0;
  let applied = 0;
  let skipped = 0;
  for (let page = 0; page < 50; page++) {
    const r = await call(c, `/pull?since=${rev}`);
    const records = (r.records as SyncRecord[]) ?? [];
    if (!records.length) {
      rev = Number(r.rev ?? rev);
      break;
    }
    pulled += records.length;
    const res = await applyRecords(records);
    applied += res.applied;
    skipped += res.skipped;
    rev = Number(r.rev ?? rev);
    if (!r.more) break;
  }

  await saveState({ lastRev: rev, lastPushAt: startedAt, lastSyncAt: Date.now() });
  return { pushed, pulled, applied, skipped, rev };
}
