/**
 * Every first block there is, and which of them is cheapest.
 *
 * A 1x2x3 block is one layer thick on one face and two layers deep towards a
 * touching one, which makes TWENTY-FOUR of them, not twelve: the pair of faces
 * alone does not say which, because the block on the left face reaching down
 * and the block on the bottom face reaching left share an edge and two corners
 * but differ in their other two edges. Both are real first blocks; which one
 * you build depends on how you are holding the cube.
 *
 * Naming them by colour is the point. "Eight moves" means nothing on its own;
 * "five moves, white down and orange left" tells you which block to look for.
 */

import { FACE_LABELS } from '../../components/palette';
import { groupSolved, type CubeState } from '../../cube/cube';
import { FACE_ORDER, ROTATIONS, faceletsOfCubie, type Vec3 } from '../../cube/geometry';

/** The outward normal of each face, in the app's URFDLB order. */
const NORMALS: Vec3[] = [
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, 1],
  [0, -1, 0],
  [-1, 0, 0],
  [0, 0, -1],
];

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export interface BlockSpec {
  /** The face that would be down, and the face that would be left, holding it */
  down: number;
  left: number;
  /** "white down, orange left" — how a person would say which block this is */
  name: string;
  /** Every sticker of the five pieces */
  tracked: number[];
  /** Which of those belong to the two corners, and which to the three edges */
  cornerAt: number[];
  edgeAt: number[];
  /** The five pieces, grouped, for finding them by colour on a drawn cube */
  pieces: number[][];
}

/**
 * The five pieces of the block you would call the first block when holding
 * `down` downwards and `left` on the left.
 *
 * It sits one layer thick on the left face and reaches two layers down:
 * everything on `left` that is not above the middle of `down`, minus the centre
 * — six positions, one of which is the centre, leaving five pieces.
 */
function blockOf(down: number, left: number): BlockSpec {
  const na = NORMALS[left];
  const nb = NORMALS[down];
  const tracked: number[] = [];
  const cornerAt: number[] = [];
  const edgeAt: number[] = [];
  const pieces: number[][] = [];

  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        const p: Vec3 = [x, y, z];
        if (dot(p, na) !== 1 || dot(p, nb) < 0) continue;
        const stickers = faceletsOfCubie(p);
        if (stickers.length < 2) continue; // the centre is not a piece
        for (const f of stickers) {
          (stickers.length === 3 ? cornerAt : edgeAt).push(tracked.length);
          tracked.push(f);
        }
        pieces.push(stickers);
      }
    }
  }
  return {
    down,
    left,
    name: `${FACE_LABELS[down].toLowerCase()} down, ${FACE_LABELS[left].toLowerCase()} left`,
    tracked,
    cornerAt,
    edgeAt,
    pieces,
  };
}

/**
 * All twenty-four: every way of choosing a down face and a left face that
 * touches it. Opposite faces do not touch and span no block.
 */
export const FIRST_BLOCKS: BlockSpec[] = (() => {
  const out: BlockSpec[] = [];
  for (let down = 0; down < 6; down++) {
    for (let left = 0; left < 6; left++) {
      if (dot(NORMALS[down], NORMALS[left]) !== 0) continue;
      out.push(blockOf(down, left));
    }
  }
  return out;
})();

/** The one the app treats as home: down is D, left is L, as the engine draws it. */
export const HOME_BLOCK: BlockSpec = FIRST_BLOCKS.find(
  (b) => b.down === FACE_ORDER.indexOf('D') && b.left === FACE_ORDER.indexOf('L'),
)!;

/**
 * Which first blocks are finished on this cube, whichever way it is held.
 *
 * More than one can be true at once by luck, and after an attempt it is how the
 * app works out which block you actually chose to build.
 */
export function blocksBuilt(state: CubeState): BlockSpec[] {
  return FIRST_BLOCKS.filter((spec) => ROTATIONS.some((rot) => groupSolved(state, rot, spec.tracked)));
}
