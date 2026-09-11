/**
 * The last six edges, solved exactly.
 *
 * ⟨M, U⟩ has only 184,320 positions, which is small enough to walk all of them
 * once and then answer any question instantly: how short the best solution is,
 * what it is, and how far a position is from having its edges oriented. No
 * search, no heuristics, no "probably optimal".
 *
 * A position is pinned down by where eight stickers are: the U/D-facing sticker
 * of each of the six edges, one top corner, and the U centre. An edge's U/D
 * sticker gives both its place and which way up it is; the corner gives the
 * AUF; the centre gives the slice's own rotation.
 */

import { LSE_UD_FACELETS, PIECES, U_CENTER_FACELET } from '../../cube/cube';
import { keyOf, moveSet, positionsAfter, stepped, turnsOf } from './tracking';

/** UL and UR come first in LSE_UD_FACELETS, then the four slice edges. */
const UL = 0;
const UR = 1;
const AUF_MARKER = LSE_UD_FACELETS.length;

export const LSE_TRACKED = [...LSE_UD_FACELETS, PIECES.U_CORNERS[0], U_CENTER_FACELET];
export const LSE_MOVES = moveSet(turnsOf(['M', 'U']));
const U_INDEX = LSE_MOVES.names.indexOf('U');

/** Where each tracked sticker goes under one, two and three U turns. */
const U_RING: number[][] = LSE_TRACKED.map((f) => {
  const ring = [f];
  let at: Uint8Array = Uint8Array.from([f]);
  for (let i = 0; i < 3; i++) {
    at = stepped(at, LSE_MOVES.to[U_INDEX]);
    ring.push(at[0]);
  }
  return ring;
});

const onUorD = (p: number) => p < 9 || (p >= 27 && p < 36);

/**
 * Edges oriented, and UL/UR in their own slots.
 *
 * Measured against the corner rather than against the solved cube: the whole
 * top layer being turned is an AUF, which 4c deals with, not a mistake.
 */
function isEolrDone(at: ArrayLike<number>): boolean {
  for (let i = 0; i < LSE_UD_FACELETS.length; i++) if (!onUorD(at[i])) return false;
  const auf = U_RING[AUF_MARKER].indexOf(at[AUF_MARKER]);
  if (auf < 0) return false;
  return at[UL] === U_RING[UL][auf] && at[UR] === U_RING[UR][auf];
}

export interface LseTables {
  /** Turns from each position back to solved */
  toSolved: Map<number, number>;
  /** Turns from each position to edges oriented with UL/UR placed */
  toEolr: Map<number, number>;
  /** The way out from solved to each position, for setting a case up */
  route: Map<number, string[]>;
  /** Every position, so a case can be drawn at random */
  all: number[];
}

let tables: LseTables | null = null;

function build(): LseTables {
  const toSolved = new Map<number, number>();
  const route = new Map<number, string[]>();
  const all: number[] = [];
  const byKey = new Map<number, Uint8Array>();

  const start = Uint8Array.from(LSE_TRACKED);
  const startKey = keyOf(start);
  toSolved.set(startKey, 0);
  route.set(startKey, []);
  byKey.set(startKey, start);
  all.push(startKey);

  let frontier = [startKey];
  let depth = 0;
  while (frontier.length) {
    const next: number[] = [];
    depth++;
    for (const key of frontier) {
      const from = byKey.get(key)!;
      const path = route.get(key)!;
      for (let m = 0; m < LSE_MOVES.names.length; m++) {
        const at = stepped(from, LSE_MOVES.to[m]);
        const k = keyOf(at);
        if (toSolved.has(k)) continue;
        toSolved.set(k, depth);
        route.set(k, [...path, LSE_MOVES.names[m]]);
        byKey.set(k, at);
        all.push(k);
        next.push(k);
      }
    }
    frontier = next;
  }

  // A second walk, outwards from everything that already counts as EOLR done
  const toEolr = new Map<number, number>();
  let wave: number[] = [];
  for (const key of all) {
    if (isEolrDone(byKey.get(key)!)) {
      toEolr.set(key, 0);
      wave.push(key);
    }
  }
  let d = 0;
  while (wave.length) {
    const next: number[] = [];
    d++;
    for (const key of wave) {
      const from = byKey.get(key)!;
      for (let m = 0; m < LSE_MOVES.names.length; m++) {
        const k = keyOf(stepped(from, LSE_MOVES.to[m]));
        if (toEolr.has(k)) continue;
        toEolr.set(k, d);
        next.push(k);
      }
    }
    wave = next;
  }

  return { toSolved, toEolr, route, all };
}

export function lseTables(): LseTables {
  if (!tables) tables = build();
  return tables;
}

export type LseGoal = 'solved' | 'eolr';

export interface Solution {
  moves: string[];
  length: number;
}

/** The shortest way to finish from here. */
export function solveLse(scramble: string[], goal: LseGoal = 'solved'): Solution | null {
  const t = lseTables();
  const dist = goal === 'solved' ? t.toSolved : t.toEolr;
  let at = positionsAfter(LSE_TRACKED, scramble);
  let d = dist.get(keyOf(at));
  if (d === undefined) return null;

  const moves: string[] = [];
  while (d > 0) {
    let stepped_ = false;
    for (let m = 0; m < LSE_MOVES.names.length; m++) {
      const to = stepped(at, LSE_MOVES.to[m]);
      if (dist.get(keyOf(to)) === d - 1) {
        moves.push(LSE_MOVES.names[m]);
        at = to;
        d--;
        stepped_ = true;
        break;
      }
    }
    if (!stepped_) return null;
  }
  return { moves, length: moves.length };
}

/** How far from the goal, without building the solution. */
export function lseDistance(scramble: string[], goal: LseGoal = 'solved'): number {
  const t = lseTables();
  const dist = goal === 'solved' ? t.toSolved : t.toEolr;
  return dist.get(keyOf(positionsAfter(LSE_TRACKED, scramble))) ?? -1;
}

/**
 * A case to train on: the turns that set it up, and how short the best solution
 * is. `hardest` biases towards the cases actually worth practising — the
 * shortest ones are over before you have looked at them.
 */
export function randomLseCase(goal: LseGoal, minLength = 4): { setup: string[]; best: number } {
  const t = lseTables();
  const dist = goal === 'solved' ? t.toSolved : t.toEolr;
  const pool: number[] = [];
  for (const key of t.all) {
    const d = dist.get(key) ?? 0;
    if (d < minLength) continue;
    // 4c cases are the ones where the edges are already oriented and placed
    if (goal === 'solved' && (t.toEolr.get(key) ?? 1) !== 0) continue;
    pool.push(key);
  }
  const key = pool[Math.floor(Math.random() * pool.length)];
  return { setup: t.route.get(key)!, best: dist.get(key)! };
}
