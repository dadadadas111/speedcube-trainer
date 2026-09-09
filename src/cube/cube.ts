/** Cube state as 54 facelets, plus the predicates built on top of it. */

import { MOVE_PERMS, ROTATIONS, faceletsOfCubie, type Vec3 } from './geometry';

/** Colours: 0=U 1=R 2=F 3=D 4=L 5=B (standard Kociemba face order). */
export type CubeState = Uint8Array;

export const SOLVED_STATE: CubeState = (() => {
  const s = new Uint8Array(54);
  for (let i = 0; i < 54; i++) s[i] = Math.floor(i / 9);
  return s;
})();

export const COLOR_LETTERS = 'URFDLB';

export function cloneState(s: CubeState): CubeState {
  return new Uint8Array(s);
}

export function applyPerm(s: CubeState, perm: Uint8Array): CubeState {
  const out = new Uint8Array(54);
  for (let j = 0; j < 54; j++) out[j] = s[perm[j]];
  return out;
}

export function applyMove(s: CubeState, move: string): CubeState {
  const perm = MOVE_PERMS[move];
  if (!perm) throw new Error(`Unknown move: ${move}`);
  return applyPerm(s, perm);
}

export function applyMoves(s: CubeState, moves: string[]): CubeState {
  let cur = s;
  for (const m of moves) cur = applyMove(cur, m);
  return cur;
}

/** The full state sequence: index i is the state after i moves. */
export function stateSequence(start: CubeState, moves: string[]): CubeState[] {
  const out: CubeState[] = [cloneState(start)];
  let cur = start;
  for (const m of moves) {
    cur = applyMove(cur, m);
    out.push(cur);
  }
  return out;
}

/** Solved: every face a single colour, regardless of how the cube is held. */
export function isSolved(s: CubeState): boolean {
  for (let f = 0; f < 6; f++) {
    const c = s[f * 9];
    for (let i = 1; i < 9; i++) if (s[f * 9 + i] !== c) return false;
  }
  return true;
}

export function statesEqual(a: CubeState, b: CubeState): boolean {
  for (let i = 0; i < 54; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * A canonical key that is invariant under whole-cube rotation.
 * Needed because a smart cube's sensors cannot tell R from l, or M from R L' —
 * every one of those ambiguities differs by exactly one whole-cube rotation.
 */
export function canonicalKey(s: CubeState): string {
  let best = '';
  for (const rot of ROTATIONS) {
    let k = '';
    for (let j = 0; j < 54; j++) k += s[rot[j]];
    if (best === '' || k < best) best = k;
  }
  return best;
}

export function toKociemba(s: CubeState): string {
  let out = '';
  for (let i = 0; i < 54; i++) out += COLOR_LETTERS[s[i]];
  return out;
}

/**
 * Does the state have a valid colour census: exactly 9 stickers per colour?
 *
 * Catches a mistyped smart-cube MAC address: with the wrong key the payload
 * decrypts to garbage, so the cube looks connected but everything read back is
 * meaningless. This does not verify the state is solvable, it only blocks junk.
 */
export function isPlausibleState(s: CubeState): boolean {
  const count = new Array(6).fill(0);
  for (let i = 0; i < 54; i++) {
    if (s[i] > 5) return false;
    count[s[i]]++;
  }
  return count.every((c) => c === 9);
}

export function fromKociemba(str: string): CubeState {
  const s = new Uint8Array(54);
  for (let i = 0; i < 54; i++) {
    const c = COLOR_LETTERS.indexOf(str[i]);
    if (c < 0) throw new Error(`Unexpected facelet character: ${str[i]}`);
    s[i] = c;
  }
  return s;
}

/* ---------- Piece groups used by the analysis ---------- */

const F = (pos: Vec3) => faceletsOfCubie(pos);

/** Every cubie of the cube, each entry being its list of facelets. */
export const ALL_CUBIES: number[][] = (() => {
  const out: number[][] = [];
  for (const x of [-1, 0, 1])
    for (const y of [-1, 0, 1])
      for (const z of [-1, 0, 1]) {
        const fs = faceletsOfCubie([x, y, z] as Vec3);
        if (fs.length) out.push(fs);
      }
  return out;
})();

/**
 * The pieces of each step, kept grouped per cubie rather than flattened.
 * Used to highlight THOSE pieces wherever they currently sit on the cube,
 * instead of highlighting the region they will eventually occupy.
 */
export const PIECE_GROUPS: Record<string, number[][]> = {
  FB: [F([-1, -1, -1]), F([-1, -1, 0]), F([-1, -1, 1]), F([-1, 0, -1]), F([-1, 0, 1])],
  SB: [F([1, -1, -1]), F([1, -1, 0]), F([1, -1, 1]), F([1, 0, -1]), F([1, 0, 1])],
  U_CORNERS: [F([-1, 1, -1]), F([-1, 1, 1]), F([1, 1, -1]), F([1, 1, 1])],
  UL_UR: [F([-1, 1, 0]), F([1, 1, 0])],
  LSE_EDGES: [F([-1, 1, 0]), F([1, 1, 0]), F([0, 1, 1]), F([0, 1, -1]), F([0, -1, 1]), F([0, -1, -1])],
  CROSS: [F([0, -1, 1]), F([0, -1, -1]), F([-1, -1, 0]), F([1, -1, 0])],
};

const colorKey = (colors: number[]) => [...colors].sort((a, b) => a - b).join('');

/**
 * Facelets of the pieces in a group, found by COLOUR so they are located even
 * while scattered mid-solve. `viewed` must already be rotated into the display
 * frame.
 */
export function piecesByColor(groups: number[][], viewed: CubeState): number[] {
  const wanted = new Set(groups.map((g) => colorKey(g.map((f) => Math.floor(f / 9)))));
  const out: number[] = [];
  for (const cubie of ALL_CUBIES) {
    if (wanted.has(colorKey(cubie.map((f) => viewed[f])))) out.push(...cubie);
  }
  return out;
}

export const PIECES = {
  /** Roux first block: the 1x2x3 block at bottom left (L centre excluded). */
  FB: [F([-1, -1, -1]), F([-1, -1, 0]), F([-1, -1, 1]), F([-1, 0, -1]), F([-1, 0, 1])].flat(),
  /** Second block: the 1x2x3 block at bottom right. */
  SB: [F([1, -1, -1]), F([1, -1, 0]), F([1, -1, 1]), F([1, 0, -1]), F([1, 0, 1])].flat(),
  /** The 4 U-layer corners (CMLL). */
  U_CORNERS: [F([-1, 1, -1]), F([-1, 1, 1]), F([1, 1, -1]), F([1, 1, 1])].flat(),
  /** The UL and UR edges (LSE step 4b). */
  UL_UR: [F([-1, 1, 0]), F([1, 1, 0])].flat(),
  /** The 6 LSE edges. */
  LSE_EDGES: [F([-1, 1, 0]), F([1, 1, 0]), F([0, 1, 1]), F([0, 1, -1]), F([0, -1, 1]), F([0, -1, -1])].flat(),
  /** CFOP cross (the 4 D-layer edges). */
  CROSS: [F([0, -1, 1]), F([0, -1, -1]), F([-1, -1, 0]), F([1, -1, 0])].flat(),
  ALL: Array.from({ length: 54 }, (_, i) => i),
};

/** The 4 F2L slots, each one D-layer corner plus one middle-layer edge. */
export const F2L_SLOTS: number[][] = [
  [...F([1, -1, 1]), ...F([1, 0, 1])], // FR
  [...F([1, -1, -1]), ...F([1, 0, -1])], // BR
  [...F([-1, -1, -1]), ...F([-1, 0, -1])], // BL
  [...F([-1, -1, 1]), ...F([-1, 0, 1])], // FL
];

const onUD = (xs: number[]) => xs.filter((i) => i < 9 || (i >= 27 && i < 36));

/** U-face facelets of the UL and UR edges, which sit outside the M slice. */
export const LSE_SIDE_UD_FACELETS: number[] = onUD([...F([-1, 1, 0]), ...F([1, 1, 0])]);

/** U/D-face facelets of the four M-slice edges (UF, UB, DF, DB). */
export const LSE_SLICE_UD_FACELETS: number[] = onUD([
  ...F([0, 1, 1]), ...F([0, 1, -1]), ...F([0, -1, 1]), ...F([0, -1, -1]),
]);

/** U/D-face facelets of all 6 LSE edges. */
export const LSE_UD_FACELETS: number[] = [...LSE_SIDE_UD_FACELETS, ...LSE_SLICE_UD_FACELETS];

export const U_CENTER_FACELET = 4;

/** Centre facelet of each face, in U R F D L B order. */
const CENTER_FACELETS = [4, 13, 22, 31, 40, 49];

/**
 * The 24 colour relabellings induced by the whole-cube rotations.
 *
 * Why this is needed at all: the cube reports its stickers in its own fixed
 * scheme (white on U, and so on), but a solver picks their own first-block
 * colours and holds the cube however they like. So the block they build may be
 * any of the twelve 1x2x3 blocks, not the one the app calls "bottom left".
 *
 * Rotating the frame the state is VIEWED through moves the positions but keeps
 * the colours pinned where they are, so on its own it can only ever recognise
 * the one block whose colours match. Relabelling the colours as well covers the
 * other eleven. Each entry maps a colour to the colour it becomes.
 */
export const COLOR_FRAMES: Uint8Array[] = ROTATIONS.map((rot) => {
  const map = new Uint8Array(6);
  // Rotating by `rot` puts the colour now at face f's centre onto face f
  for (let f = 0; f < 6; f++) map[Math.floor(rot[CENTER_FACELETS[f]] / 9)] = f;
  return map;
});

/** The relabelling that changes nothing, for the common case. */
export const IDENTITY_COLORS: Uint8Array = COLOR_FRAMES.find((m) => m.every((c, i) => c === i))!;

/** Re-read a state under a different colour scheme. Positions do not move. */
export function recolor(s: CubeState, colors: Uint8Array): CubeState {
  const out = new Uint8Array(54);
  for (let i = 0; i < 54; i++) out[i] = colors[s[i]];
  return out;
}

/**
 * Is a group of facelets in place, viewing the cube through rotation `rot`?
 * `rot` maps the solver's frame onto the canonical one (U up, L left, ...).
 */
export function groupSolved(s: CubeState, rot: Uint8Array, facelets: number[]): boolean {
  for (const a of facelets) {
    if (s[rot[a]] !== Math.floor(a / 9)) return false;
  }
  return true;
}
