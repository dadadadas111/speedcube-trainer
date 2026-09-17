/**
 * Turning somebody else's reconstruction into something a smart cube can follow.
 *
 * Two things are written down that a cube cannot see, and both of them break a
 * guide that takes the notation at face value.
 *
 * The first is the whole-cube rotation. Nothing turns, no sensor fires, and the
 * state does not change — but which face the solver means next does. Rotate to
 * x' and the face they now call U is a face the cube still calls something
 * else, so from that point on every move they wrote disagrees with every move
 * the cube reports, and the guide waits for a turn that will never arrive under
 * that name. Skipping the rotation is therefore not enough: it has to be
 * applied to the REST of the solution.
 *
 * The second is the slice, and it is the subtler one. A smart cube has six
 * sensors, one per face, and there is no seventh for the middle. It cannot
 * report M at all. What it reports is `L R'`, because that is what physically
 * happened relative to its core — and M' is not `L R'`, it is `L R' x`. The x
 * is the core turning inside the cube, invisible to it and to us. Every wide
 * move hides one the same way: r is `L` plus an x.
 *
 * So a slice move does two things at once here: it contributes face turns the
 * cube WILL report, and it shifts the frame for everything after it — the
 * opposite way round from the solver's own rotations, because a rotation turns
 * the shell the notation is named against while a slice turns the core the cube
 * names against. Get this wrong and the guide is correct right up to the first
 * M, then quietly asks for the wrong faces for the rest of the solve.
 *
 * The rotations are still shown. You have to hold the cube their way or the
 * moves are unreachable with your fingers, and knowing how to hold it at the
 * start is half of copying somebody's solve. The hidden ones are not shown,
 * because you do not perform them — they happen to you.
 */

import type { ScrambleProgress } from './scrambleGuide';
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
  /**
   * The step's turns as the cube will report them: face turns only, never a
   * slice or a wide, because six sensors cannot report a seventh layer.
   */
  moves: string[];
  /**
   * The same turns as the solver wrote them, for showing.
   *
   * NOT one for one with `moves` — M' is one thing to read and two things for
   * the cube to see — so `belongsTo` is what lines the two up.
   */
  written: string[];
  /** For each of `moves`, which `written` move it is part of */
  belongsTo: number[];
  /**
   * The frame in force at each of `moves`, for naming a turn back the way the
   * solver would. Only needed to tell someone what to undo: they are holding
   * the cube their way, so being told to undo the cube's name for a face sends
   * them to the wrong one.
   */
  frames: Uint8Array[];
}

/**
 * What six face sensors actually report for a slice or a wide move, and the
 * whole-cube rotation that comes with it and cannot be seen.
 *
 * Derived rather than remembered — __followtest.ts rebuilds every row from the
 * permutations and fails if one is wrong.
 */
const SEEN: Record<string, { turns: string[]; rot: string }> = {
  M: { turns: ["L'", 'R'], rot: "x'" },
  "M'": { turns: ['L', "R'"], rot: 'x' },
  M2: { turns: ['L2', 'R2'], rot: 'x2' },
  E: { turns: ["D'", 'U'], rot: "y'" },
  "E'": { turns: ['D', "U'"], rot: 'y' },
  E2: { turns: ['D2', 'U2'], rot: 'y2' },
  S: { turns: ['B', "F'"], rot: 'z' },
  "S'": { turns: ["B'", 'F'], rot: "z'" },
  S2: { turns: ['B2', 'F2'], rot: 'z2' },
  r: { turns: ['L'], rot: 'x' },
  "r'": { turns: ["L'"], rot: "x'" },
  r2: { turns: ['L2'], rot: 'x2' },
  l: { turns: ['R'], rot: "x'" },
  "l'": { turns: ["R'"], rot: 'x' },
  l2: { turns: ['R2'], rot: 'x2' },
  u: { turns: ['D'], rot: 'y' },
  "u'": { turns: ["D'"], rot: "y'" },
  u2: { turns: ['D2'], rot: 'y2' },
  d: { turns: ['U'], rot: "y'" },
  "d'": { turns: ["U'"], rot: 'y' },
  d2: { turns: ['U2'], rot: 'y2' },
  f: { turns: ['B'], rot: 'z' },
  "f'": { turns: ["B'"], rot: "z'" },
  f2: { turns: ['B2'], rot: 'z2' },
  b: { turns: ['F'], rot: "z'" },
  "b'": { turns: ["F'"], rot: 'z' },
  b2: { turns: ['F2'], rot: 'z2' },
};

export const hiddenTurn = (move: string) => SEEN[move];

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
 * Rewrite a solution so no step depends on having rotated the cube, and no
 * step asks for a layer the cube cannot sense.
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
    const belongsTo: number[] = [];
    const frames: Uint8Array[] = [];
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
      const named = moveInFrame(move, invert(frame));
      const at = written.length;
      written.push(move);
      const seen = SEEN[named];
      if (!seen) {
        turns.push(named);
        belongsTo.push(at);
        frames.push(frame);
        continue;
      }
      // A slice or a wide: the cube reports the outer layers that moved, and
      // the rotation of the core that came with them is invisible.
      for (const t of seen.turns) {
        turns.push(t);
        belongsTo.push(at);
        frames.push(frame);
      }
      // Folded on the OTHER side from a solver's rotation, and settled the same
      // way — by trial. Composed this way all 39 reconstructions follow through
      // to a solved cube; the three other orders break 31, 31 and 39 of them.
      frame = compose(MOVE_PERMS[seen.rot], frame);
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
      belongsTo,
      frames,
    });
    pending = [];
    folded = [];
  }

  // A solve that ends on a rotation: kept so it is still shown
  if (pending.length) {
    out.push({
      label: folded.join(' + ') || 'turn the cube',
      hold: pending,
      moves: [],
      written: [],
      belongsTo: [],
      frames: [],
    });
  }
  return out;
}

/**
 * One list of turns, as the cube will actually report it.
 *
 * The same problem turns up wherever the app hands someone a sequence and then
 * watches them do it, not just when following a reconstruction: a CMLL
 * scramble is built from U and M, an LSE case is mostly M, and a cube with six
 * face sensors reports none of them. Feeding `M` to a ScrambleTracker means
 * flashing red at the first half of every slice and telling the solver to undo
 * a turn they were asked to make.
 */
export const sensedMoves = (moves: string[]): FollowStep =>
  followSteps([{ label: '', moves }])[0] ?? {
    label: '',
    hold: [],
    moves: [],
    written: [],
    belongsTo: [],
    frames: [],
  };

/** Every turn to be made, rotations removed and the rest rewritten. */
export const followMoves = (steps: FollowStep[]): string[] => steps.flatMap((s) => s.moves);

/**
 * Which written move the guide should be pointing at.
 *
 * The tracker counts in the cube's turns and the guide reads in the solver's,
 * and since M' is one of the second and two of the first they cannot share an
 * index.
 */
export function writtenIndex(step: FollowStep, cubeDone: number): number {
  if (cubeDone >= step.moves.length) return step.written.length;
  return step.belongsTo[cubeDone] ?? step.written.length;
}

/**
 * Name a turn the way the solver would, for telling someone what to undo.
 *
 * They are holding the cube the solver's way, so "undo R'" in the cube's own
 * names points at whichever face the cube calls R — which after a y is not the
 * one under their right hand.
 */
export function asWritten(step: FollowStep, cubeDone: number, moves: string[]): string[] {
  const frame = step.frames[Math.min(cubeDone, step.frames.length - 1)];
  if (!frame) return moves;
  return moves.map((m) => moveInFrame(m, frame));
}

/**
 * The tracker's progress, retold in the solver's own move names.
 *
 * The tracker counts the cube's turns because those are the ones it can see;
 * the guide shows the solver's because those are the ones you read. They are
 * not the same list and not the same length, so one has to be translated into
 * the other before anything can be highlighted or corrected.
 */
export function progressInWritten(step: FollowStep, p: ScrambleProgress): ScrambleProgress {
  const done = writtenIndex(step, p.done);
  return {
    ...p,
    done,
    total: step.written.length,
    next: p.next === null ? null : (step.written[done] ?? null),
    // "Undo R'" in the cube's names points at whichever face the cube calls R,
    // which after a y is not the one under your right hand.
    fix: asWritten(step, p.done, p.fix),
  };
}
