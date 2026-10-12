/**
 * Drilling CMLL without scrambling the cube in your hands.
 *
 * The ordinary drill hands you a scramble and waits while you perform it. That
 * is honest but slow: most of a session is spent setting up cases rather than
 * recognising them, and the setup teaches nothing.
 *
 * So this decouples the two cubes. The case is put on the VIRTUAL cube, and the
 * one in your hands becomes a move source and nothing more: whatever state it
 * happens to be in is irrelevant, because its turns are applied to the virtual
 * cube instead of being compared against it. You look, you execute, the virtual
 * cube reaches a finished CMLL, and the next case is dealt without you touching
 * anything. After twenty of them your real cube is in a mess, and that is fine.
 *
 * csTimer does this for OLL and PLL and calls it training / continuous mode. It
 * cannot do it for CMLL, because its completion test is "the scramble is
 * undone" with a few hard-coded exceptions. Ours is `cmllDone`, which asks a
 * different question — are the four top corners placed, edges ignored — and is
 * invariant to both the angle you hold the cube at and the final AUF.
 *
 * The one thing that cannot be checked is whether you are holding the cube the
 * way the screen draws it. Nothing in the move stream can reveal that, because
 * the real cube is not in the pictured state to compare against. So it is a
 * convention, and the orientation is yours to choose rather than assumed.
 */

import { ROTATIONS } from '../cube/geometry';
import { applyPerm, applyMoves, SOLVED_STATE, cloneState, type CubeState } from '../cube/cube';
import { cmllScrambleFor, type Rng } from './cmll';

/**
 * The stickers CMLL is recognised from: four corners on top, the pair of
 * corner stickers on the top row of each side, and the top centre.
 *
 * The centre earns its place by being the reference the corners are read
 * against — without it you cannot tell at a glance which colour counts as
 * up. Edges are deliberately absent: they are the half of the last layer this
 * step does not touch, and on screen they are the half that distracts.
 */
export const CMLL_FACELETS = [0, 2, 4, 6, 8, 9, 11, 18, 20, 36, 38, 45, 47];

/** 0=U 1=R 2=F 3=D 4=L 5=B in the solved cube; these are the names for them. */
const COLOR_NAMES = ['white', 'red', 'green', 'yellow', 'orange', 'blue'] as const;
export type ColorName = (typeof COLOR_NAMES)[number];

/**
 * Which colour on top comes first in the list.
 *
 * Alphabetical put "blue top" at the head and buried yellow near the end,
 * which is the wrong way round: Roux is normally learned with white on the
 * bottom, so yellow is the colour most people will be drilling against.
 */
const UP_ORDER: readonly ColorName[] = ['yellow', 'white', 'green', 'blue', 'red', 'orange'];

export interface Orientation {
  /** Stable id, e.g. "yellow-green" for yellow on top and green at the front */
  key: string;
  up: ColorName;
  front: ColorName;
  /**
   * Old colour -> new colour. A relabelling, not a rotation.
   *
   * Turning the cube would carry the case off the top layer, and CMLL is
   * always the layer that is up. What changes between "white on top" and
   * "yellow on top" is which colours you are looking at, not where the case
   * sits, so this maps colours and leaves the geometry alone.
   */
  recolour: Uint8Array;
}

/**
 * All 24 ways to hold the cube, named by what ends up at U and F.
 *
 * Built from the rotation group rather than written out, so the names cannot
 * drift from the geometry they claim to describe.
 */
export const ORIENTATIONS: Orientation[] = ROTATIONS.map((perm) => {
  const view = applyPerm(SOLVED_STATE, perm);
  // The centre of each face in this view is what that face's colour becomes
  const recolour = new Uint8Array(6);
  for (let face = 0; face < 6; face++) recolour[face] = view[face * 9 + 4];
  return { key: `${COLOR_NAMES[view[4]]}-${COLOR_NAMES[view[22]]}`, up: COLOR_NAMES[view[4]], front: COLOR_NAMES[view[22]], recolour };
}).sort((a, b) => UP_ORDER.indexOf(a.up) - UP_ORDER.indexOf(b.up) || a.front.localeCompare(b.front));

/**
 * Repaint a state into an orientation's colours, for DRAWING only.
 *
 * The state the drill reasons about stays in standard colours, because
 * `cmllDone` compares against them and a repainted cube reads as unsolved to
 * it. Recognition is a thing you do with your eyes, so the orientation belongs
 * to the picture and nowhere else: the virtual cube is turned in the logic by
 * your moves, and painted for your eyes on the way out.
 */
export const recolourState = (state: CubeState, o: Orientation): CubeState => {
  const out = new Uint8Array(54);
  for (let i = 0; i < 54; i++) out[i] = o.recolour[state[i]];
  return out;
};

export const orientationByKey = (key: string): Orientation =>
  ORIENTATIONS.find((o) => o.key === key) ?? ORIENTATIONS.find((o) => o.key === 'yellow-green')!;

export interface DealtDrill<T> {
  entry: T;
  /** The case in standard colours; paint it with recolourState to draw it */
  state: CubeState;
  /** How it was set up, for checking the drill against itself */
  scramble: string[];
}

/**
 * Put a case on the virtual cube.
 *
 * The case is built the way the scramble drill builds it: the algorithm run
 * backwards, buried between free turns so it does not read as an algorithm
 * reversed. The orientation is not applied here — the same case in
 * yellow-green and in white-red is one case drilled against two colour
 * schemes, and only the drawing differs.
 */
export function dealDrill<T extends { alg: string }>(
  pool: T[],
  parse: (alg: string) => string[],
  rng: Rng = Math.random,
): DealtDrill<T> | null {
  if (!pool.length) return null;
  for (let i = 0; i < 8; i++) {
    const entry = pool[Math.floor(rng() * pool.length) % pool.length];
    let moves: string[];
    try {
      moves = parse(entry.alg);
    } catch {
      continue;
    }
    const scramble = cmllScrambleFor(moves, rng);
    if (!scramble) continue;
    // Standard colours: see recolourState for why the orientation is not
    // baked in here.
    return { entry, state: applyMoves(cloneState(SOLVED_STATE), scramble), scramble };
  }
  return null;
}
