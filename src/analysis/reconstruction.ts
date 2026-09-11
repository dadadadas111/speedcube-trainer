/**
 * Turning an analysed solve into a reconstruction someone can read.
 *
 * Two things have to happen for the notation to make sense:
 *
 *  - The moves have to be grouped by step, so you can see which turns did the
 *    first block and which did CMLL, instead of one long run.
 *  - They have to be read in the frame the cube was actually being held in. The
 *    app's frame drifts every time a wide turn goes by (the sensors cannot tell
 *    `r` from `L`), so without this the notation reads rotated partway through.
 *
 * About the rotations: a smart cube cannot sense them at all — turning the whole
 * cube moves no face relative to the core, so there is simply nothing to report.
 * What is shown here is INFERRED: when the frame a step was recognised in
 * differs from the previous step's, the solver must have rotated the cube
 * in between, and this names that rotation. It says where a rotation happened
 * between steps, not one made in the middle of a step.
 */

import { moveInFrame, rotationBetween } from '../cube/alg';
import { IDENTITY_PERM } from '../cube/geometry';
import type { SolveAnalysis } from './solve';

export interface ReconMove {
  /** Notation in the step's own frame */
  move: string;
  /** Index into analysis.moves, so clicking one can seek the replay */
  index: number;
  /** Gap from the previous move (ms) */
  deltaMs: number;
}

export interface ReconStep {
  key: string;
  label: string;
  /** The rotation the solver must have made before this step; inferred */
  rotation: string[];
  moves: ReconMove[];
  durationMs: number;
  detected: boolean;
}

export function reconstruct(a: SolveAnalysis): ReconStep[] {
  const out: ReconStep[] = [];
  let prevFrame: Uint8Array = IDENTITY_PERM as Uint8Array;
  for (const step of a.steps) {
    const frame = step.frame ?? prevFrame;
    const moves: ReconMove[] = [];
    for (let i = step.startIndex; i < step.endIndex; i++) {
      const m = a.moves[i];
      if (!m) continue;
      moves.push({
        move: moveInFrame(m.move, frame),
        index: i + 1,
        deltaMs: i === 0 ? m.t : m.t - a.moves[i - 1].t,
      });
    }
    out.push({
      key: step.key,
      label: step.label,
      rotation: rotationBetween(prevFrame, frame),
      moves,
      durationMs: step.durationMs,
      detected: step.detected,
    });
    prevFrame = frame;
  }

  // Turns made after the cube was already solved — usually a turn and its
  // inverse to wake the bluetooth up. They belong to no step, but dropping them
  // silently would leave the replay with moves that have no chip.
  const covered = a.steps.reduce((n, s) => Math.max(n, s.endIndex), 0);
  if (covered < a.moves.length) {
    out.push({
      key: 'after',
      label: 'After the solve',
      rotation: [],
      moves: a.moves.slice(covered).map((m, k) => ({
        move: moveInFrame(m.move, prevFrame),
        index: covered + k + 1,
        deltaMs: m.t - (a.moves[covered + k - 1]?.t ?? m.t),
      })),
      durationMs: 0,
      detected: false,
    });
  }
  return out;
}

/** The whole thing on one line, the way a reconstruction is usually written. */
export function reconstructionText(steps: ReconStep[]): string {
  return steps
    .filter((s) => s.moves.length || s.rotation.length)
    .map((s) => [...s.rotation, ...s.moves.map((m) => m.move)].join(' ') + `  // ${s.label}`)
    .join('\n');
}
