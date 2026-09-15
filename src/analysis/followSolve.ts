/**
 * Turning somebody else's reconstruction into something a smart cube can follow.
 *
 * A written solve contains whole-cube rotations, and a smart cube cannot see
 * one: nothing turns, no sensor fires, and the state does not change. What DOES
 * change is which face the solver means next. Rotate to x' and the face they
 * now call U is a face the cube still calls something else, so from that point
 * on every move they wrote disagrees with every move the cube reports — and the
 * guide sits there waiting for a turn that will never arrive under that name.
 *
 * Skipping the rotation step is therefore not enough, which is what made it
 * look like the rotations were being ignored when they were not being handled.
 * The rotations have to be applied to the REST of the solution: each later move
 * is rewritten into the frame the cube reports in, so the guide asks for what
 * the cube will actually say.
 *
 * The rotation is still shown. You have to hold the cube their way or the moves
 * are unreachable with your fingers, and knowing how to hold it at the start is
 * half of copying somebody's solve.
 */

import { isRotationPerm, moveInFrame } from '../cube/alg';
import { IDENTITY_PERM, MOVE_PERMS } from '../cube/geometry';

export interface FollowStep {
  /** The solver's own name for the step */
  label: string;
  /**
   * How to be holding the cube, as the solver wrote it — "y", "x'", "z2".
   * Shown rather than waited for: nothing turns, so there is nothing to detect.
   */
  hold: string[];
  /** The step's turns, in the frame the cube reports — what to watch for */
  moves: string[];
  /**
   * The same turns as the solver wrote them, for showing.
   *
   * One for one with `moves`, so a position in the guide means the same thing
   * in both: you read their move, the cube reports ours.
   */
  written: string[];
}

const isRotation = (move: string) => {
  const p = MOVE_PERMS[move];
  return !!p && isRotationPerm(p);
};

const compose = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(54);
  for (let i = 0; i < 54; i++) out[i] = a[b[i]];
  return out;
};

const invert = (p: Uint8Array): Uint8Array => {
  const out = new Uint8Array(54);
  for (let i = 0; i < 54; i++) out[p[i]] = i;
  return out;
};

/**
 * Rewrite a solution so no step depends on having rotated the cube.
 *
 * The frame accumulates across steps, because a rotation in the middle of the
 * first block is still in force during CMLL.
 *
 * A step that is nothing but rotations — an "inspection" of `y x2`, say — is
 * not a step anyone can be watched doing: nothing turns and no sensor fires, so
 * waiting for it is waiting forever, which is exactly what happened. Its
 * rotations are folded into the NEXT step's `hold`, shown as how to be holding
 * the cube rather than as something to finish. Knowing how to hold it is half
 * of copying somebody's solve; being asked to prove you are holding it that way
 * is impossible.
 */
export function followSteps(steps: { label: string; moves: string[] }[]): FollowStep[] {
  let frame: Uint8Array = new Uint8Array(IDENTITY_PERM);
  const out: FollowStep[] = [];
  /** Rotations seen since the last step that had real turns in it */
  let pending: string[] = [];
  /** Names of the rotation-only steps folded in, so none is lost */
  let folded: string[] = [];

  for (const { label, moves } of steps) {
    const hold = [...pending];
    const turns: string[] = [];
    const written: string[] = [];
    for (const move of moves) {
      if (isRotation(move)) {
        hold.push(move);
        // Later moves are named in the rotated view, so the frame carries on
        frame = compose(frame, MOVE_PERMS[move]);
        continue;
      }
      // The INVERSE of the accumulated rotation. Established by experiment
      // rather than argued from first principles: from a scrambled cube "y R"
      // reaches the same position as "B", and moveInFrame('R', y) is F while
      // moveInFrame('R', y⁻¹) is B. Backwards, it yields a sequence that looks
      // perfectly reasonable and does not solve the cube.
      turns.push(moveInFrame(move, invert(frame)));
      written.push(move);
    }
    if (!turns.length) {
      pending = hold;
      folded.push(label);
      continue;
    }
    out.push({
      label: folded.length ? `${folded.join(' + ')} + ${label}` : label,
      hold,
      moves: turns,
      written,
    });
    pending = [];
    folded = [];
  }

  // A solve that ends on a rotation: kept so it is still shown
  if (pending.length) {
    out.push({ label: folded.join(' + ') || 'turn the cube', hold: pending, moves: [], written: [] });
  }
  return out;
}

/** Every turn to be made, rotations removed and the rest rewritten. */
export const followMoves = (steps: FollowStep[]): string[] => steps.flatMap((s) => s.moves);
