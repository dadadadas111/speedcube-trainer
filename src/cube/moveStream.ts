/**
 * Cleaning up the raw move stream from a smart cube.
 *
 * GAN sensors only measure the 6 faces turning relative to the CORE. Because the
 * core rides along with the middle slice:
 *   - an M turn arrives as two near-simultaneous events, R and L'
 *   - a wide r turn arrives as L (indistinguishable from a real L)
 *   - x/y/z whole-cube rotations produce no events at all
 *
 * This module reconstructs the sequence "as the solver thinks of it" from the
 * one "as the sensors report it" — the inverse of cube/sensorSim.ts.
 *
 * THE EASY MISTAKE: the full identity is `M = R L' x'`. Merging R + L' into M
 * while forgetting the x' term leaves the model rotated while every LATER move
 * is still applied in the old frame — the state ends up wrong outright, not just
 * off by a rotation. So each time a slice is reconstructed, all remaining moves
 * must be conjugated by the matching rotation.
 */

import { moveFace, moveAmount, makeMove } from './alg';
import { MOVE_PERMS, composePerm, IDENTITY_PERM } from './geometry';

export interface TimedMove {
  /** Move notation, e.g. "R'" or "M2" */
  move: string;
  /** Timestamp in ms since the solve started */
  t: number;
  /** How many raw events were merged into this move (used to adjust stats) */
  merged?: number;
}

/** (face A + direction, face B + direction) -> the slice move, and the core's drift */
const SLICE_PAIRS: Record<string, { slice: string; rot: string }> = {
  "R|L'": { slice: 'M', rot: "x'" },
  "R'|L": { slice: "M'", rot: 'x' },
  'R2|L2': { slice: 'M2', rot: 'x2' },
  "U|D'": { slice: 'E', rot: "y'" },
  "U'|D": { slice: "E'", rot: 'y' },
  'U2|D2': { slice: 'E2', rot: 'y2' },
  "F'|B": { slice: 'S', rot: 'z' },
  "F|B'": { slice: "S'", rot: "z'" },
  'F2|B2': { slice: 'S2', rot: 'z2' },
};

function slicePair(a: string, b: string) {
  return SLICE_PAIRS[`${a}|${b}`] ?? SLICE_PAIRS[`${b}|${a}`] ?? null;
}

const FACE_MOVES = ['U', 'R', 'F', 'D', 'L', 'B'].flatMap((f) => [f, f + "'", f + '2']);
const permKey = (p: Uint8Array) => p.join(',');
const FACE_BY_PERM = new Map(FACE_MOVES.map((m) => [permKey(MOVE_PERMS[m]), m]));

function invertPerm(p: Uint8Array): Uint8Array {
  const out = new Uint8Array(54);
  for (let i = 0; i < 54; i++) out[p[i]] = i;
  return out;
}

/**
 * Given that the sensors reported face turn `reported`, which move is it in the
 * solver's frame once the core has drifted by `drift`? The inverse of the
 * conjugation done in sensorSim.
 */
function unconjugate(reported: string, drift: Uint8Array): string {
  const p = composePerm(composePerm(drift, MOVE_PERMS[reported]), invertPerm(drift));
  return FACE_BY_PERM.get(permKey(p)) ?? reported;
}

export interface CleanupOptions {
  /**
   * Window for merging the two halves of a slice move (ms). On a real cube the
   * two layers never turn at exactly the same instant — measured on a real solve
   * the gap reached ~120ms.
   */
  sliceWindow?: number;
  /** Window for merging two same-face turns into a half turn (ms) */
  doubleWindow?: number;
}

/**
 * Normalise the stream: rebuild slice moves, merge half turns, drop
 * cancellations. Returns a new list, leaving the input untouched.
 *
 * The result differs from the true state by at most one whole-cube rotation
 * (there is no way to know whether the solver rotated the cube in their hands),
 * which every downstream analysis tolerates because it checks all 24 frames.
 */
export function cleanMoveStream(moves: TimedMove[], opts: CleanupOptions = {}): TimedMove[] {
  const sliceWindow = opts.sliceWindow ?? 140;
  const doubleWindow = opts.doubleWindow ?? 160;

  // Pass 1: rebuild slice moves, conjugating the rest by the core's rotation
  const sliced: TimedMove[] = [];
  let drift: Uint8Array = IDENTITY_PERM as Uint8Array;
  for (let i = 0; i < moves.length; i++) {
    const cur = unconjugate(moves[i].move, drift);
    const next = moves[i + 1];
    if (next && next.t - moves[i].t <= sliceWindow) {
      const pair = slicePair(cur, unconjugate(next.move, drift));
      if (pair) {
        sliced.push({ move: pair.slice, t: next.t, merged: 2 });
        drift = composePerm(invertPerm(MOVE_PERMS[pair.rot]), drift);
        i++;
        continue;
      }
    }
    sliced.push({ move: cur, t: moves[i].t });
  }

  // Pass 2: merge adjacent same-face turns (R R -> R2, M M -> M2, R R' -> gone)
  const out: TimedMove[] = [];
  for (const m of sliced) {
    const prev = out[out.length - 1];
    if (prev && moveFace(prev.move) === moveFace(m.move) && m.t - prev.t <= doubleWindow) {
      const merged = makeMove(moveFace(m.move), moveAmount(prev.move) + moveAmount(m.move));
      out.pop();
      if (merged) out.push({ move: merged, t: m.t, merged: (prev.merged ?? 1) + (m.merged ?? 1) });
      continue;
    }
    out.push(m);
  }
  return out;
}

/** Move count in HTM (a half turn counts as one). */
export function htmCount(moves: TimedMove[]): number {
  return moves.length;
}
