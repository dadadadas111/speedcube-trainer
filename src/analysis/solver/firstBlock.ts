/**
 * The shortest first block, found exactly.
 *
 * Five pieces matter — two corners and three edges — so the search state is
 * where their twelve stickers are and nothing else. That is small enough to
 * walk the corners and the edges separately and keep the exact distance of
 * every arrangement of each: 504 for the pair of corners, 10,560 for the three
 * edges. Whichever is further is a lower bound on the real answer, which is
 * what a depth-first search needs to stop wasting its time.
 *
 * Counted in STM: every face turn and every slice turn is one move. A wide turn
 * is written as its face and slice, so `r` reads as `R M'` and counts two.
 */

import { PIECES } from '../../cube/cube';
import { mayFollow, moveSet, positionsAfter, stepped, turnsOf } from './tracking';

export const FB_TRACKED = PIECES.FB;

/**
 * PIECES.FB runs corner, edge, corner, edge, edge — so the two groups are
 * picked out by index rather than by slicing.
 */
const CORNER_AT = [0, 1, 2, 5, 6, 7];
const EDGE_AT = [3, 4, 8, 9, 10, 11];

export const FB_MOVES = moveSet(turnsOf(['U', 'D', 'L', 'R', 'F', 'B', 'M', 'E', 'S']));

const pick = (at: ArrayLike<number>, which: number[]) => {
  let key = 0;
  for (const i of which) key = key * 54 + at[i];
  return key;
};

/** Exact distances for one half of the block, from every arrangement it can reach. */
function walk(which: number[]): Map<number, number> {
  const home = Uint8Array.from(FB_TRACKED);
  const dist = new Map<number, number>();
  const seen = new Map<number, Uint8Array>();
  const startKey = pick(home, which);
  dist.set(startKey, 0);
  seen.set(startKey, home);

  let frontier = [startKey];
  let depth = 0;
  while (frontier.length) {
    const next: number[] = [];
    depth++;
    for (const key of frontier) {
      const from = seen.get(key)!;
      for (let m = 0; m < FB_MOVES.names.length; m++) {
        const at = stepped(from, FB_MOVES.to[m]);
        const k = pick(at, which);
        if (dist.has(k)) continue;
        dist.set(k, depth);
        seen.set(k, at);
        next.push(k);
      }
    }
    frontier = next;
  }
  return dist;
}

let corners: Map<number, number> | null = null;
let edges: Map<number, number> | null = null;

export function fbTables(): { corners: Map<number, number>; edges: Map<number, number> } {
  if (!corners || !edges) {
    corners = walk(CORNER_AT);
    edges = walk(EDGE_AT);
  }
  return { corners, edges };
}

/** A lower bound on the moves left: solving either half alone cannot be quicker. */
function estimate(at: Uint8Array): number {
  const t = fbTables();
  const c = t.corners.get(pick(at, CORNER_AT)) ?? 0;
  const e = t.edges.get(pick(at, EDGE_AT)) ?? 0;
  return c > e ? c : e;
}

const solved = (at: Uint8Array) => {
  for (let i = 0; i < FB_TRACKED.length; i++) if (at[i] !== FB_TRACKED[i]) return false;
  return true;
};

export interface FbResult {
  /** Shortest length in STM */
  length: number;
  /** Solutions of that length; there is usually more than one */
  solutions: string[][];
}

/**
 * Every shortest first block for this scramble.
 *
 * Iterative deepening: try to finish in 0 moves, then 1, and so on, never
 * following a branch whose lower bound already exceeds the depth being tried.
 * The first depth that yields anything is the optimum, by construction.
 */
export function solveFirstBlock(scramble: string[], maxSolutions = 6, maxDepth = 12): FbResult {
  fbTables();
  const start = positionsAfter(FB_TRACKED, scramble);
  if (solved(start)) return { length: 0, solutions: [[]] };

  for (let depth = estimate(start); depth <= maxDepth; depth++) {
    const found: string[][] = [];
    const path: string[] = [];

    const search = (at: Uint8Array, left: number, prev: string | null): void => {
      if (found.length >= maxSolutions) return;
      if (left === 0) {
        if (solved(at)) found.push([...path]);
        return;
      }
      if (estimate(at) > left) return;
      for (let m = 0; m < FB_MOVES.names.length; m++) {
        const name = FB_MOVES.names[m];
        if (!mayFollow(name, prev)) continue;
        path.push(name);
        search(stepped(at, FB_MOVES.to[m]), left - 1, name);
        path.pop();
        if (found.length >= maxSolutions) return;
      }
    };

    search(start, depth, null);
    if (found.length) return { length: depth, solutions: found };
  }
  return { length: -1, solutions: [] };
}

/** How short the best first block is, without listing them. */
export function firstBlockLength(scramble: string[]): number {
  return solveFirstBlock(scramble, 1).length;
}

/** Is the first block built? Checked on tracked positions, not colours. */
export const firstBlockDone = (scramble: string[]) => solved(positionsAfter(FB_TRACKED, scramble));
