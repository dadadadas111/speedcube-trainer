/**
 * Following a handful of stickers through a sequence of moves.
 *
 * A solver does not need the whole cube. Every trainer here cares about a small
 * set of pieces — the five of a first block, the six edges of LSE — so the
 * search state is just where those stickers currently are. That is a dozen
 * numbers rather than fifty-four, and it makes the pattern databases small
 * enough to build in a blink.
 *
 * Positions, not colours: colours cannot say which of two identical stickers is
 * which, and a solver has to know. The cases here are always generated from a
 * move sequence, so the mapping from "sticker" to "where it is now" is exact.
 */

import { MOVE_PERMS } from '../../cube/geometry';

/** Where a sticker at each position ends up. `applyPerm` does out[i] = s[perm[i]],
 *  so the sticker at perm[i] lands on i — which is the inverse of the table. */
const inverseOf = (perm: Uint8Array): Uint8Array => {
  const out = new Uint8Array(54);
  for (let i = 0; i < 54; i++) out[perm[i]] = i;
  return out;
};

export interface MoveSet {
  names: string[];
  /** For move m, where the sticker at position p goes */
  to: Uint8Array[];
}

export function moveSet(names: string[]): MoveSet {
  return { names, to: names.map((n) => inverseOf(MOVE_PERMS[n])) };
}

/** Every quarter and half turn of the given faces and slices. */
export function turnsOf(layers: string[]): string[] {
  return layers.flatMap((f) => [f, `${f}'`, `${f}2`]);
}

/** Which layer a move turns, for deciding what may follow what. */
export const layerOf = (move: string) => move[0];

/**
 * The axis a layer lies on. Two moves on the same axis commute, so a search
 * that tries them in both orders is doing the same work twice.
 */
export const AXIS: Record<string, number> = { L: 0, R: 0, M: 0, U: 1, D: 1, E: 1, F: 2, B: 2, S: 2 };

/** A fixed order within an axis, so only one of each commuting pair is explored. */
export const ORDER: Record<string, number> = { L: 0, M: 1, R: 2, U: 0, E: 1, D: 2, F: 0, S: 1, B: 2 };

/**
 * May `move` follow `prev`? Never the same layer twice — that is either a
 * cancellation or a longer way to write one move — and on a shared axis only in
 * the fixed order above.
 */
export function mayFollow(move: string, prev: string | null): boolean {
  if (!prev) return true;
  const a = layerOf(move);
  const b = layerOf(prev);
  if (a === b) return false;
  if (AXIS[a] !== AXIS[b]) return true;
  return ORDER[a] > ORDER[b];
}

/** Where the tracked stickers sit after a scramble. */
export function positionsAfter(tracked: number[], scramble: string[]): Uint8Array {
  const at = new Uint8Array(54);
  for (let i = 0; i < 54; i++) at[i] = i;
  for (const m of scramble) {
    const to = inverseOf(MOVE_PERMS[m]);
    const next = new Uint8Array(54);
    for (let i = 0; i < 54; i++) next[i] = to[at[i]];
    at.set(next);
  }
  return Uint8Array.from(tracked.map((f) => at[f]));
}

/**
 * The most stickers that pack into one key: 54^9 is under 2^53, 54^10 is not.
 */
export const MAX_PACKED = 9;

/**
 * A number standing for one arrangement of the tracked stickers.
 *
 * Positions are below 54, so up to nine of them pack into a double exactly.
 * Past that the arithmetic silently loses the low digits and different
 * arrangements start sharing a key — which does not fail, it just quietly
 * answers wrong. Hence the refusal rather than a comment.
 */
export function keyOf(positions: ArrayLike<number>, count = positions.length): number {
  if (count > MAX_PACKED) {
    throw new Error(`keyOf: ${count} positions cannot pack into one number; split the set`);
  }
  let key = 0;
  for (let i = 0; i < count; i++) key = key * 54 + positions[i];
  return key;
}

/** Apply one move to a set of tracked positions, in place. */
export function step(positions: Uint8Array, to: Uint8Array): void {
  for (let i = 0; i < positions.length; i++) positions[i] = to[positions[i]];
}

/** Apply one move, returning a new array. */
export function stepped(positions: Uint8Array, to: Uint8Array): Uint8Array {
  const out = new Uint8Array(positions.length);
  for (let i = 0; i < positions.length; i++) out[i] = to[positions[i]];
  return out;
}

export const isHome = (positions: ArrayLike<number>, tracked: number[]): boolean => {
  for (let i = 0; i < tracked.length; i++) if (positions[i] !== tracked[i]) return false;
  return true;
};
