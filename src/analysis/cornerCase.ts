/**
 * Identifying which case a last-layer alg solves, purely by computation.
 *
 * Used to file a newly added alg into the right family automatically, and to
 * spot when two algs actually solve the same case. It never relies on names
 * given by people.
 *
 * The signature is normalised for AUF: turning the U layer before the alg does
 * not make it a different case. Each corner slot is encoded by its OFFSET from
 * home rather than its absolute position, then the minimum over the 4 rotations
 * is taken.
 */

import { SOLVED_STATE, applyMoves, PIECES, groupSolved, type CubeState } from '../cube/cube';
import { ROTATIONS, FACELET_NORMAL, faceletsOfCubie, type Vec3 } from '../cube/geometry';
import { invertAlg } from '../cube/alg';

/** The four U-layer corner slots, going around the U face. */
const U_CORNER_SLOTS: Vec3[] = [
  [-1, 1, -1], // back-left
  [1, 1, -1],  // back-right
  [1, 1, 1],   // front-right
  [-1, 1, 1],  // front-left
];

const det3 = (a: readonly number[], b: readonly number[], c: readonly number[]) =>
  a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);

/**
 * The three facelets of each corner slot, ordered with the same handedness at
 * all four slots. The order is picked so the determinant of the three normals is
 * positive, which makes "twist 1" mean the same thing everywhere.
 */
const SLOT_FACELETS: number[][] = U_CORNER_SLOTS.map((pos) => {
  const fs = faceletsOfCubie(pos);
  const [a, b, c] = fs;
  const n = (i: number) => FACELET_NORMAL[i];
  return det3(n(a), n(b), n(c)) > 0 ? [a, b, c] : [a, c, b];
});

/** The home colour set of each corner slot (the face indices of its facelets). */
const SLOT_HOME_COLORS: string[] = SLOT_FACELETS.map((fs) =>
  fs.map((i) => Math.floor(i / 9)).sort((x, y) => x - y).join(''),
);

export interface CornerCase {
  /** Orientation signature of the four corners — this is the "family" (OCLL set) */
  family: string;
  /** Full signature including permutation: same signature means same case */
  full: string;
  /** Whether the alg leaves both Roux blocks intact */
  preservesBlocks: boolean;
  /** Whether it only touches the four U corners (U-layer edges may move) */
  cornersOnly: boolean;
}

/** Read (position offset, twist) for the four U-layer corner slots. */
function readCorners(s: CubeState): { offset: number; twist: number }[] | null {
  const out: { offset: number; twist: number }[] = [];
  for (let slot = 0; slot < 4; slot++) {
    const fs = SLOT_FACELETS[slot];
    const colors = fs.map((i) => s[i]);
    const home = SLOT_HOME_COLORS.indexOf([...colors].sort((a, b) => a - b).join(''));
    if (home < 0) return null; // not a U-layer corner here -> alg is not of this kind
    // twist = where the U (or D) coloured sticker sits in the handed triple
    const twist = colors.findIndex((c) => c === 0 || c === 3);
    if (twist < 0) return null;
    out.push({ offset: (home - slot + 4) % 4, twist });
  }
  return out;
}

/**
 * The smallest signature across the four U-layer rotations.
 *
 * One U turn does two things at once: it cycles the corner slots, AND it drops
 * every piece's offset by one (a piece moving to the next slot is one step
 * closer to home). Miss that second part and two spellings of the same case
 * produce two different signatures.
 */
function canonicalize(corners: { offset: number; twist: number }[]): { family: string; full: string } {
  let bestFull = '';
  let bestFamily = '';
  for (let k = 0; k < 4; k++) {
    let full = '';
    let family = '';
    for (let i = 0; i < 4; i++) {
      const src = corners[(i - k + 4) % 4];
      full += `${(src.offset - k + 4) % 4}${src.twist}`;
      family += String(src.twist);
    }
    if (bestFull === '' || full < bestFull) bestFull = full;
    if (bestFamily === '' || family < bestFamily) bestFamily = family;
  }
  return { family: bestFamily, full: bestFull };
}

/**
 * Classify the case that `alg` solves. That case is exactly the state reached
 * by running the alg backwards from solved.
 */
export function classifyCornerAlg(alg: string[]): CornerCase | null {
  if (!alg.length) return null;
  const caseState = applyMoves(SOLVED_STATE, invertAlg(alg));
  const corners = readCorners(caseState);
  if (!corners) return null;

  const identity = ROTATIONS.find((r) => r.every((v, i) => v === i))!;
  const blocks = groupSolved(caseState, identity, PIECES.FB) && groupSolved(caseState, identity, PIECES.SB);
  // "corners only" = everything but the four U corners and six LSE edges is untouched
  const untouched = PIECES.ALL.filter(
    (i) => !PIECES.U_CORNERS.includes(i) && !PIECES.LSE_EDGES.includes(i) && i !== 4,
  );
  const cornersOnly = untouched.every((i) => caseState[i] === Math.floor(i / 9));

  return {
    ...canonicalize(corners),
    preservesBlocks: blocks,
    cornersOnly,
  };
}

/** A suggested family name, derived from the twist pattern of the four corners. */
export function describeFamily(family: string): string {
  const twists = [...family].map(Number);
  const oriented = twists.filter((t) => t === 0).length;
  if (oriented === 4) return 'all four corners oriented';
  if (oriented === 1) return 'three corners twisted the same way';
  if (oriented === 2) return 'two oriented, two twisted';
  return 'all four corners twisted';
}
