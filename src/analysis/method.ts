/**
 * Detecting solve steps from the move stream.
 *
 * The key idea: every condition is tested against ALL 24 cube orientations
 * ("there exists an orientation such that..."). That makes each condition
 * invariant under whole-cube rotation — necessary because a smart cube cannot
 * tell r from L, so the model's frame can drift from reality mid-solve.
 */

import { type CubeState, PIECES, PIECE_GROUPS, F2L_SLOTS, LSE_UD_FACELETS, U_CENTER_FACELET, COLOR_FRAMES, IDENTITY_COLORS, recolor, groupSolved, isSolved, piecesByColor } from '../cube/cube';
import { ROTATIONS, MOVE_PERMS, composePerm, IDENTITY_PERM } from '../cube/geometry';

/**
 * The 24 orientations, multiplied by the 4 positions of the U layer.
 *
 * Needed for the LSE steps: the solver spins the U layer constantly there, so
 * although the four corners are done as far as CMLL is concerned, they are
 * rarely sitting in their final position. Demanding the AUF be right too means
 * EO and 4b almost never match until the cube is fully solved, and the whole of
 * LSE collapses into one lump.
 *
 * Turning the U layer never touches either block, so this set is safe here.
 */
const AUF_FRAMES = (() => {
  const perms: Uint8Array[] = [];
  const bases: Uint8Array[] = [];
  const seen = new Set<string>();
  for (const rot of ROTATIONS) {
    let u: Uint8Array = IDENTITY_PERM as Uint8Array;
    for (let k = 0; k < 4; k++) {
      // View through the orientation FIRST, then apply the U turn — the other
      // order turns the U layer of the raw frame, not the solver's.
      const p = composePerm(rot, u);
      const key = p.join(',');
      if (!seen.has(key)) {
        seen.add(key);
        perms.push(p);
        bases.push(rot);
      }
      u = composePerm(u, MOVE_PERMS['U']);
    }
  }
  return { perms, bases };
})();

export const ROTATIONS_WITH_AUF: Uint8Array[] = AUF_FRAMES.perms;

/**
 * For each entry above, the plain rotation it was built from — an AUF is not a
 * way of holding the cube, so notation has to be read in the rotation alone.
 */
export const ROTATIONS_WITH_AUF_BASE: Uint8Array[] = AUF_FRAMES.bases;

export type MethodName = 'roux' | 'cfop';

export interface StageSpec {
  key: string;
  label: string;
  /** Short description shown in the review */
  hint: string;
  test: (s: CubeState, rot: Uint8Array) => boolean;
  /**
   * Accept any rotation of the U layer. Enabled for the LSE steps, where the U
   * layer spins constantly but the four corners still count as done.
   */
  allowAuf?: boolean;
  /**
   * The test says nothing about how the cube is held — true for the last step,
   * which is just "solved". Reading notation in a frame picked at random would
   * invent a rotation that never happened, so these report no frame at all.
   */
  anyFrame?: boolean;
}

const rouxFB = (s: CubeState, rot: Uint8Array) => groupSolved(s, rot, PIECES.FB);
const rouxSB = (s: CubeState, rot: Uint8Array) => rouxFB(s, rot) && groupSolved(s, rot, PIECES.SB);
const rouxCMLL = (s: CubeState, rot: Uint8Array) => rouxSB(s, rot) && groupSolved(s, rot, PIECES.U_CORNERS);

const facesUD = (s: CubeState, rot: Uint8Array, f: number) => {
  const c = s[rot[f]];
  return c === 0 || c === 3;
};

/**
 * EO done: all 6 LSE edges are oriented (their U/D colour faces U or D) and the
 * M slice is aligned (the U centre sits on the U or D face).
 *
 * Why alignment must be part of it: the "EO done" set has to be invariant under
 * ⟨M2, U⟩, the move group of step 4b — once 4a is finished, doing 4b must not
 * break EO. This condition is exactly that invariant (U preserves each edge's
 * orientation, M2 preserves both orientation and slice parity).
 *
 * A looser rule such as "also accept a slice that is 90 degrees off" is NOT
 * invariant under U: a single U turn mixes M-slice edges with the UL/UR edges,
 * producing a half-right state. Verified by walking all 184320 states of the
 * ⟨M, U⟩ group (see the tests).
 */
export const rouxEdgesOriented = (s: CubeState, rot: Uint8Array) => {
  if (!facesUD(s, rot, U_CENTER_FACELET)) return false;
  for (const f of LSE_UD_FACELETS) if (!facesUD(s, rot, f)) return false;
  return true;
};

const rouxEO = (s: CubeState, rot: Uint8Array) => rouxCMLL(s, rot) && rouxEdgesOriented(s, rot);

/** 4b done: only the M slice is left (UL/UR are in place). */
const rouxLR = (s: CubeState, rot: Uint8Array) =>
  rouxCMLL(s, rot) && groupSolved(s, rot, PIECES.UL_UR);

export const ROUX_STAGES: StageSpec[] = [
  { key: 'FB', label: 'First Block', hint: 'The left 1x2x3 block — mostly planning and lookahead', test: rouxFB },
  { key: 'SB', label: 'Second Block', hint: 'The right 1x2x3 block — lookahead plus efficient r/M', test: rouxSB },
  { key: 'CMLL', label: 'CMLL', hint: 'Orient and permute the 4 top corners — recognition plus algs', test: rouxCMLL },
  { key: 'EO', label: 'LSE 4a (EO)', hint: 'Orient the remaining 6 edges', test: rouxEO, allowAuf: true },
  { key: 'LR', label: 'LSE 4b (UL/UR)', hint: 'Place the UL and UR edges', test: rouxLR, allowAuf: true },
  { key: 'L4C', label: 'LSE 4c (M slice)', hint: 'Finish the middle slice', test: (s) => isSolved(s), anyFrame: true },
];

const cfopCross = (s: CubeState, rot: Uint8Array) => groupSolved(s, rot, PIECES.CROSS);
const slotsDone = (s: CubeState, rot: Uint8Array) =>
  F2L_SLOTS.reduce((n, slot) => n + (groupSolved(s, rot, slot) ? 1 : 0), 0);
const cfopF2L = (n: number) => (s: CubeState, rot: Uint8Array) => cfopCross(s, rot) && slotsDone(s, rot) >= n;
const cfopOLL = (s: CubeState, rot: Uint8Array) => {
  if (!cfopF2L(4)(s, rot)) return false;
  for (let i = 0; i < 9; i++) if (s[rot[i]] !== 0) return false;
  return true;
};

export const CFOP_STAGES: StageSpec[] = [
  { key: 'CROSS', label: 'Cross', hint: 'Should take ~8 moves, with the first F2L pair already spotted', test: cfopCross },
  { key: 'F2L1', label: 'F2L #1', hint: '', test: cfopF2L(1) },
  { key: 'F2L2', label: 'F2L #2', hint: '', test: cfopF2L(2) },
  { key: 'F2L3', label: 'F2L #3', hint: '', test: cfopF2L(3) },
  { key: 'F2L4', label: 'F2L #4', hint: 'Lookahead is everything — do not pause between pairs', test: cfopF2L(4) },
  { key: 'OLL', label: 'OLL', hint: 'Recognition plus algs', test: cfopOLL },
  { key: 'PLL', label: 'PLL', hint: 'Recognition plus algs', test: (s) => isSolved(s), anyFrame: true },
];

export function stagesFor(method: MethodName): StageSpec[] {
  return method === 'cfop' ? CFOP_STAGES : ROUX_STAGES;
}

export interface StageDetection {
  key: string;
  label: string;
  hint: string;
  /** Move count at which this step finished; -1 if it was never detected */
  endIndex: number;
  /** The orientation that matched, used for display; null if none */
  rotation: Uint8Array | null;
  /**
   * The same thing without any AUF mixed in: the way the cube was being held.
   * Notation is read in this, since turning the U layer is not a way of holding
   * the cube.
   */
  frame: Uint8Array | null;
}

/**
 * A forward, monotone scan: a later step cannot finish before an earlier one.
 * For each step we take the EARLIEST moment it holds after the previous one.
 */
export function detectStages(states: CubeState[], specs: StageSpec[], colors?: Uint8Array): StageDetection[] {
  if (colors && colors !== IDENTITY_COLORS) states = states.map((s) => recolor(s, colors));
  const out: StageDetection[] = [];
  let from = 0;
  for (const spec of specs) {
    let found = -1;
    let rotation: Uint8Array | null = null;
    let frame: Uint8Array | null = null;
    const frames = spec.allowAuf ? ROTATIONS_WITH_AUF : ROTATIONS;
    const bases = spec.allowAuf ? ROTATIONS_WITH_AUF_BASE : ROTATIONS;
    for (let i = from; i < states.length && found < 0; i++) {
      for (let j = 0; j < frames.length; j++) {
        if (spec.test(states[i], frames[j])) {
          found = i;
          rotation = frames[j];
          frame = bases[j];
          break;
        }
      }
    }
    out.push({ key: spec.key, label: spec.label, hint: spec.hint, endIndex: found, rotation, frame: spec.anyFrame ? null : frame });
    if (found < 0) {
      // Not detected -> leave the remaining steps blank too
      from = states.length;
    } else {
      from = found;
    }
  }
  return out;
}

export interface StageScan {
  detections: StageDetection[];
  /** The colour scheme the solve was read in; needed to highlight the right pieces */
  colors: Uint8Array;
}

/**
 * How well one reading of the solve holds together.
 *
 * A wrong colour scheme does not fail loudly — it simply finds nothing until
 * the cube is finished, and then every step lands on the last move at once. So
 * the score counts DISTINCT boundaries first: the right scheme spreads the six
 * steps out, a wrong one piles them up at the end.
 */
function scanScore(det: StageDetection[]): number {
  const idx = det.map((d) => d.endIndex).filter((i) => i >= 0);
  if (!idx.length) return -1;
  const distinct = new Set(idx).size;
  // Tie-break towards the reading whose first step finishes earliest: with two
  // schemes that both hold together, that is the one where the block the solver
  // built first is being read as the first block.
  return idx.length * 10000 + distinct * 100 - Math.min(99, idx[0]);
}

/**
 * Detect the steps without being told the solver's colour scheme.
 *
 * Tries each of the 24 colour relabellings and keeps the reading that holds
 * together best. The first step is scanned alone as a filter, because it is
 * cheap and rules out most schemes immediately.
 */
export function scanStages(states: CubeState[], specs: StageSpec[]): StageScan {
  let best: StageScan | null = null;
  let bestScore = -Infinity;
  for (const colors of COLOR_FRAMES) {
    // Cheap filter: no first step under this scheme means no reading at all
    if (specs.length > 1 && detectStages(states, [specs[0]], colors)[0].endIndex < 0) continue;
    const detections = detectStages(states, specs, colors);
    const score = scanScore(detections);
    if (score > bestScore) {
      bestScore = score;
      best = { detections, colors };
    }
  }
  return best ?? { detections: detectStages(states, specs), colors: IDENTITY_COLORS };
}

/**
 * Guess the method when the user leaves it on "auto": pick whichever method's
 * first step completes earliest as a fraction of the move count.
 */
export function guessMethod(states: CubeState[]): MethodName {
  const n = Math.max(1, states.length - 1);
  const rouxFirst = scanStages(states, [ROUX_STAGES[0]]).detections[0].endIndex;
  const cfopFirst = scanStages(states, [CFOP_STAGES[0]]).detections[0].endIndex;
  if (rouxFirst < 0) return 'cfop';
  if (cfopFirst < 0) return 'roux';
  // A CFOP cross finishes very early; a Roux first block usually costs more moves.
  return rouxFirst / n <= cfopFirst / n ? 'roux' : 'cfop';
}

/**
 * The pieces a step is responsible for, located by colour in the state being
 * displayed — so during replay you see those very pieces light up even while
 * they are still scattered, and watch them come together.
 */
export function stepPieceGroups(key: string): number[][] {
  switch (key) {
    case 'FB': return PIECE_GROUPS.FB;
    case 'SB': return PIECE_GROUPS.SB;
    case 'CMLL': return PIECE_GROUPS.U_CORNERS;
    case 'EO':
    case 'L4C': return PIECE_GROUPS.LSE_EDGES;
    case 'LR': return PIECE_GROUPS.UL_UR;
    case 'CROSS': return PIECE_GROUPS.CROSS;
    case 'F2L1': case 'F2L2': case 'F2L3': case 'F2L4':
      return F2L_SLOTS.map((slot) => slot);
    case 'OLL':
    case 'PLL': return PIECE_GROUPS.U_CORNERS.concat(PIECE_GROUPS.UL_UR);
    default: return [];
  }
}

/** Facelets to highlight for a step, based on the state being displayed. */
export function stepHighlight(key: string, viewed: CubeState, colors?: Uint8Array): number[] {
  const groups = stepPieceGroups(key);
  if (!groups.length) return [];
  // The pieces are found by colour, so they have to be read in the same scheme
  // the steps were detected in. Positions are untouched, so the facelet indices
  // this returns still point at the right squares on screen.
  return piecesByColor(groups, colors && colors !== IDENTITY_COLORS ? recolor(viewed, colors) : viewed);
}
