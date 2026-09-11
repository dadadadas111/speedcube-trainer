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
import type { CubeState } from '../../cube/cube';
import { simplifyMoves } from '../../cube/alg';
import { keyOf, moveSet, positionsAfter, positionsFromState, stepped, turnsOf } from './tracking';

/** UL and UR come first in LSE_UD_FACELETS, then the four slice edges. */
const UL = 0;
const UR = 1;
const AUF_MARKER = LSE_UD_FACELETS.length;
const CENTRE = AUF_MARKER + 1;

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
 * Edges oriented, the slice aligned, and UL/UR in their own slots.
 *
 * Measured against the corner rather than against the solved cube: the whole
 * top layer being turned is an AUF, which 4c deals with, not a mistake.
 *
 * The slice check is not redundant, tempting though it is to drop it. With U
 * turns mixed in, an odd number of M quarters can leave every edge's U/D
 * sticker back on U or D while the centres sit a quarter turn out — which is
 * not EO done, and the rest of the app has always said so. Without this the
 * solver called such positions finished and the trainer then refused to accept
 * them, which is the same disagreement from both ends.
 */
function isEolrDone(at: ArrayLike<number>): boolean {
  if (!onUorD(at[CENTRE])) return false;
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

/** Walk downhill through the table, one turn at a time, to the nearest goal. */
function descend(start: Uint8Array, dist: Map<number, number>): Solution | null {
  let at = start;
  let d = dist.get(keyOf(at));
  if (d === undefined) return null;

  const moves: string[] = [];
  while (d > 0) {
    let moved = false;
    for (let m = 0; m < LSE_MOVES.names.length; m++) {
      const to = stepped(at, LSE_MOVES.to[m]);
      if (dist.get(keyOf(to)) === d - 1) {
        moves.push(LSE_MOVES.names[m]);
        at = to;
        d--;
        moved = true;
        break;
      }
    }
    if (!moved) return null;
  }
  return { moves, length: moves.length };
}

/** The shortest way to finish from here. */
export function solveLse(scramble: string[], goal: LseGoal = 'solved'): Solution | null {
  const t = lseTables();
  return descend(positionsAfter(LSE_TRACKED, scramble), goal === 'solved' ? t.toSolved : t.toEolr);
}

/** The same, for a cube in front of you rather than a case the app dealt. */
export function solveLseFromState(state: CubeState, goal: LseGoal = 'solved'): Solution | null {
  const at = positionsFromState(state, LSE_TRACKED);
  if (!at) return null;
  const t = lseTables();
  return descend(at, goal === 'solved' ? t.toSolved : t.toEolr);
}

/**
 * How to get from the cube in your hands into a given case.
 *
 * Always via solved, which is not the shortest route but is always a route —
 * and it is what makes case after case possible without putting the cube down.
 * A case set up from solved only works once: the cube does not end solved after
 * EOLR, so the second case would be impossible to reach.
 *
 * Null when the cube is not in the last-six-edges group at all, which is a real
 * answer: there is nothing to do but solve the rest of it first.
 */
export function lseSetupFromState(state: CubeState, caseKey: number): string[] | null {
  const t = lseTables();
  const at = positionsFromState(state, LSE_TRACKED);
  if (!at) return null;
  const home = descend(at, t.toSolved);
  const route = t.route.get(caseKey);
  if (!home || !route) return null;
  // The join between the two halves almost always has an M meeting an M'
  return simplifyMoves([...home.moves, ...route]);
}

/** How far from the goal, without building the solution. */
export function lseDistance(scramble: string[], goal: LseGoal = 'solved'): number {
  const t = lseTables();
  const dist = goal === 'solved' ? t.toSolved : t.toEolr;
  return dist.get(keyOf(positionsAfter(LSE_TRACKED, scramble))) ?? -1;
}

/**
 * How long a case is worth training on.
 *
 * The lengths are not evenly spread. 4c splits cleanly in two: ninety-odd
 * positions needing eight turns or fewer, which is the case set everybody
 * actually drills, and another ninety-odd needing fourteen to eighteen, which
 * nobody does. EOLR runs from one to eleven with the bulk in the middle.
 * Sampling the whole group instead would hand out a seventeen-turn case most of
 * the time, which is not practice, it is a chore.
 */
const BANDS: Record<LseGoal, { min: number; max: number }> = {
  solved: { min: 2, max: 8 },
  eolr: { min: 4, max: 10 },
};

/** A case to train on: the turns that set it up, and how short the best is. */
export function randomLseCase(
  goal: LseGoal,
  band = BANDS[goal],
): { key: number; setup: string[]; best: number } {
  const t = lseTables();
  const dist = goal === 'solved' ? t.toSolved : t.toEolr;
  const pool: number[] = [];
  for (const key of t.all) {
    const d = dist.get(key) ?? 0;
    if (d < band.min || d > band.max) continue;
    // A 4c case is one where the edges are already oriented and placed
    if (goal === 'solved' && (t.toEolr.get(key) ?? 1) !== 0) continue;
    pool.push(key);
  }
  const key = pool[Math.floor(Math.random() * pool.length)];
  return { key, setup: t.route.get(key)!, best: dist.get(key)! };
}

export { BANDS as LSE_BANDS };
