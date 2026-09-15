/**
 * Turning local rows into records another device can understand, and back.
 *
 * The hard part is not the fields — it is the references between them. A solve
 * points at its session by the auto-increment id this browser handed out, and
 * that number means something else entirely on the phone. Sent as it stands, a
 * solve would arrive filed under a stranger's session, and nothing about it
 * would look wrong.
 *
 * So a reference travels as the parent's `uid` and is resolved back to whatever
 * local id this device happens to use. Parents therefore have to be applied
 * before their children, which is why the table order below is not alphabetical.
 *
 * Kept apart from the network and the database so the translation — the part
 * that quietly corrupts data when it is wrong — can be tested on its own.
 */

/** Parents first: a solve cannot be filed until its session exists here. */
export const SYNC_TABLES = ['sessions', 'algs', 'solves', 'reps'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

/** Which field of a row points at which other table. */
export const PARENT: Record<SyncTable, { field: string; table: SyncTable } | null> = {
  sessions: null,
  algs: null,
  solves: { field: 'sessionId', table: 'sessions' },
  reps: { field: 'algId', table: 'algs' },
};

/** What crosses the wire. */
export interface SyncRecord {
  table: SyncTable;
  uid: string;
  updatedAt: number;
  deleted: 0 | 1;
  data: Record<string, unknown>;
}

export interface LocalRow {
  id?: number;
  uid?: string;
  updatedAt?: number;
  [key: string]: unknown;
}

/** uid of a parent row, by its local id. */
export type UidOf = (table: SyncTable, localId: number) => string | undefined;
/** local id of a parent row, by its uid. */
export type IdOf = (table: SyncTable, uid: string) => number | undefined;

/**
 * A local row as a record to send.
 *
 * Returns null when the row cannot be described without lying — a solve whose
 * session has no uid yet, say. Skipping it means it goes next time, once the
 * session has one; sending it would file it under nothing.
 */
export function toRecord(table: SyncTable, row: LocalRow, uidOf: UidOf): SyncRecord | null {
  if (!row.uid || typeof row.updatedAt !== 'number') return null;
  const { id: _id, uid, updatedAt, ...rest } = row;
  const data: Record<string, unknown> = { ...rest };
  const parent = PARENT[table];
  if (parent) {
    const local = row[parent.field];
    if (typeof local !== 'number') return null;
    const parentUid = uidOf(parent.table, local);
    if (!parentUid) return null;
    delete data[parent.field];
    data[`${parent.field}Uid`] = parentUid;
  }
  return { table, uid, updatedAt, deleted: 0, data };
}

/**
 * A record from another device as a row to store here.
 *
 * Returns null when the parent it names has not arrived yet. Applying the
 * tables in order normally prevents that, but a push that was cut in half by a
 * dropped connection can leave a child without its parent, and a solve
 * attached to whatever session happens to have that id would be worse than a
 * solve that shows up one sync later.
 */
export function toRow(rec: SyncRecord, idOf: IdOf): LocalRow | null {
  const data = { ...rec.data };
  const parent = PARENT[rec.table];
  if (parent) {
    const key = `${parent.field}Uid`;
    const parentUid = data[key];
    if (typeof parentUid !== 'string') return null;
    const local = idOf(parent.table, parentUid);
    if (local === undefined) return null;
    delete data[key];
    data[parent.field] = local;
  }
  return { ...data, uid: rec.uid, updatedAt: rec.updatedAt };
}

/** A deletion, as something to send. */
export function tombstoneRecord(table: SyncTable, uid: string, deletedAt: number): SyncRecord {
  return { table, uid, updatedAt: deletedAt, deleted: 1, data: {} };
}

/**
 * Whether an incoming record should replace what is here.
 *
 * Strictly newer, so that a record echoed back from the server — which happens
 * on every sync, because a push is followed by a pull that includes it — does
 * not rewrite the local row and mark it changed all over again. Left as "newer
 * or equal" the two devices hand the same record back and forth forever.
 */
export function shouldApply(incoming: SyncRecord, existing: LocalRow | undefined): boolean {
  if (!existing) return true;
  return incoming.updatedAt > (existing.updatedAt ?? 0);
}
