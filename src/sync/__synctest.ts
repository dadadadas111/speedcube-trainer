/**
 * Translating rows to records and back — the part that corrupts data silently
 * when it is wrong, because a solve filed under the wrong session looks fine.
 */

import { toRecord, toRow, tombstoneRecord, shouldApply, SYNC_TABLES, PARENT, type SyncRecord } from './records';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

/* ---- Parents before children ---- */
{
  const order = SYNC_TABLES.indexOf.bind(SYNC_TABLES);
  for (const t of SYNC_TABLES) {
    const p = PARENT[t];
    if (p) check(`${t} is applied after ${p.table}`, order(p.table) < order(t));
  }
  check('nothing is its own parent', SYNC_TABLES.every((t) => PARENT[t]?.table !== t));
}

/* ---- A row with no reference ---- */
{
  const row = { id: 3, uid: 's-1', updatedAt: 100, name: 'Main session', method: 'roux' };
  const rec = toRecord('sessions', row, () => undefined)!;
  check('the local id is not sent', !('id' in rec.data), JSON.stringify(rec.data));
  check('the uid is', rec.uid === 's-1');
  check('and the fields are', rec.data.name === 'Main session' && rec.data.method === 'roux');
  const back = toRow(rec, () => undefined)!;
  check('coming back it has no local id either', back.id === undefined);
  check('it keeps its uid', back.uid === 's-1' && back.updatedAt === 100);
  check('and its fields', back.name === 'Main session');
}

/* ---- A row that points at another ---- */
{
  // This device calls the session 3; the other one calls it 9
  const solve = { id: 7, uid: 'sv-1', updatedAt: 200, sessionId: 3, timeMs: 12345 };
  const rec = toRecord('solves', solve, (t, id) => (t === 'sessions' && id === 3 ? 's-1' : undefined))!;
  check('the reference travels as a uid', rec.data.sessionIdUid === 's-1', JSON.stringify(rec.data));
  check('and the local number does not', !('sessionId' in rec.data));

  const here = toRow(rec, (t, uid) => (t === 'sessions' && uid === 's-1' ? 9 : undefined))!;
  check('it lands on this device\'s own id', here.sessionId === 9, String(here.sessionId));
  check('and nothing of the uid is left in the row', !('sessionIdUid' in here));
  check('the payload survives', here.timeMs === 12345);
}

/* ---- Refusing rather than guessing ---- */
{
  const solve = { id: 7, uid: 'sv-1', updatedAt: 200, sessionId: 3, timeMs: 1 };
  check('a solve whose session has no uid is not sent', toRecord('solves', solve, () => undefined) === null);
  check('a row with no uid is not sent', toRecord('sessions', { id: 1, updatedAt: 1 }, () => undefined) === null);
  check('nor one with no timestamp', toRecord('sessions', { id: 1, uid: 'x' }, () => undefined) === null);

  const rec = toRecord('solves', solve, () => 's-1')!;
  check('a solve whose session has not arrived is not stored', toRow(rec, () => undefined) === null);
  const noUid: SyncRecord = { table: 'solves', uid: 'a', updatedAt: 1, deleted: 0, data: { timeMs: 1 } };
  check('nor one that names no session at all', toRow(noUid, () => 1) === null);
}

/* ---- Deleting ---- */
{
  const t = tombstoneRecord('solves', 'sv-9', 500);
  check('a tombstone says which record', t.uid === 'sv-9' && t.table === 'solves');
  check('and that it is a deletion', t.deleted === 1);
  check('its time is when it was deleted', t.updatedAt === 500);
}

/* ---- Which version wins ---- */
{
  const rec: SyncRecord = { table: 'solves', uid: 'a', updatedAt: 200, deleted: 0, data: {} };
  check('anything beats nothing', shouldApply(rec, undefined));
  check('newer wins', shouldApply(rec, { updatedAt: 100 }));
  check('older loses', !shouldApply(rec, { updatedAt: 300 }));
  // The record just pushed comes straight back on the following pull; applying
  // it would restamp the row and send it again, forever
  check('the same version is not reapplied', !shouldApply(rec, { updatedAt: 200 }));
  check('a row with no timestamp is overwritten', shouldApply(rec, {}));
}

/* ---- A full round trip across two devices ---- */
{
  // Phone: session 1, alg 1, a solve and a rep
  const phone = {
    sessions: [{ id: 1, uid: 'S', updatedAt: 10, name: 'Main' }],
    algs: [{ id: 1, uid: 'A', updatedAt: 11, alg: "R U R'" }],
    solves: [{ id: 1, uid: 'V', updatedAt: 12, sessionId: 1, timeMs: 9000 }],
    reps: [{ id: 1, uid: 'P', updatedAt: 13, algId: 1, execMs: 1200 }],
  };
  const uidOf = (t: string, id: number) =>
    (phone as Record<string, { id: number; uid: string }[]>)[t].find((r) => r.id === id)?.uid;
  const sent = SYNC_TABLES.flatMap((t) =>
    (phone as Record<string, Record<string, unknown>[]>)[t].map((r) => toRecord(t, r, uidOf as never)!),
  );
  check('everything is sendable', sent.every(Boolean) && sent.length === 4);

  // Laptop already has its own session and alg at different ids
  const laptop: Record<string, { id: number; uid: string }[]> = {
    sessions: [{ id: 41, uid: 'S' }], algs: [{ id: 77, uid: 'A' }], solves: [], reps: [],
  };
  const idOf = (t: string, uid: string) => laptop[t].find((r) => r.uid === uid)?.id;
  const landed = sent.map((r) => toRow(r, idOf as never));
  check('everything lands', landed.every((r) => r !== null));
  const solve = landed[2]!;
  const rep = landed[3]!;
  check('the solve follows the session to its new id', solve.sessionId === 41, String(solve.sessionId));
  check('the rep follows the alg to its new id', rep.algId === 77, String(rep.algId));
  check('and the numbers are untouched', solve.timeMs === 9000 && rep.execMs === 1200);
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
