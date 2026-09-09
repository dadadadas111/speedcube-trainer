/**
 * Geometry of the 3x3 cube, and generation of the permutation table per move.
 *
 * Every turn is derived from a single 3D coordinate model, so no table is typed
 * by hand -> no transcription bugs. Axes: x = right, y = up, z = front.
 *
 * The 54 facelets are indexed in Kociemba order: U(0-8) R(9-17) F(18-26)
 * D(27-35) L(36-44) B(45-53), each face read row by row. That is exactly the
 * format GAN smart cubes report, so states can be compared directly.
 */

export type Vec3 = readonly [number, number, number];

export const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type FaceName = (typeof FACE_ORDER)[number];

/** normal = outward normal, row = direction of increasing row, col = of increasing column */
const FACE_GEOMETRY: Record<FaceName, { n: Vec3; row: Vec3; col: Vec3 }> = {
  U: { n: [0, 1, 0], row: [0, 0, 1], col: [1, 0, 0] },
  R: { n: [1, 0, 0], row: [0, -1, 0], col: [0, 0, -1] },
  F: { n: [0, 0, 1], row: [0, -1, 0], col: [1, 0, 0] },
  D: { n: [0, -1, 0], row: [0, 0, -1], col: [1, 0, 0] },
  L: { n: [-1, 0, 0], row: [0, -1, 0], col: [0, 0, 1] },
  B: { n: [0, 0, -1], row: [0, -1, 0], col: [-1, 0, 0] },
};

export const FACELET_POS: Vec3[] = [];
export const FACELET_NORMAL: Vec3[] = [];

const keyOf = (p: Vec3, n: Vec3) => `${p[0]},${p[1]},${p[2]}|${n[0]},${n[1]},${n[2]}`;
const indexByKey = new Map<string, number>();

for (const face of FACE_ORDER) {
  const g = FACE_GEOMETRY[face];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const p: Vec3 = [
        g.n[0] * 1.5 + g.row[0] * (row - 1) + g.col[0] * (col - 1),
        g.n[1] * 1.5 + g.row[1] * (row - 1) + g.col[1] * (col - 1),
        g.n[2] * 1.5 + g.row[2] * (row - 1) + g.col[2] * (col - 1),
      ];
      indexByKey.set(keyOf(p, g.n), FACELET_POS.length);
      FACELET_POS.push(p);
      FACELET_NORMAL.push(g.n);
    }
  }
}

/** Rotate a vector about an axis (0=x,1=y,2=z), right-hand rule, `quarters` times 90 degrees. */
function rotateVec(v: Vec3, axis: number, quarters: number): Vec3 {
  let [x, y, z] = v;
  let q = ((quarters % 4) + 4) % 4;
  while (q-- > 0) {
    if (axis === 0) [y, z] = [-z, y];
    else if (axis === 1) [x, z] = [z, -x];
    else [x, y] = [-y, x];
  }
  return [x, y, z];
}

/** The cubie holding facelet i: round 1.5 -> 1 */
export function cubieOf(i: number): Vec3 {
  const p = FACELET_POS[i];
  const clamp = (v: number) => Math.max(-1, Math.min(1, Math.round(v)));
  return [clamp(p[0]), clamp(p[1]), clamp(p[2])] as Vec3;
}

/** All facelets belonging to the cubie at a given position. */
export function faceletsOfCubie(pos: Vec3): number[] {
  const out: number[] = [];
  for (let i = 0; i < 54; i++) {
    const c = cubieOf(i);
    if (c[0] === pos[0] && c[1] === pos[1] && c[2] === pos[2]) out.push(i);
  }
  return out;
}

type LayerDef = { axis: 0 | 1 | 2; quarters: number; min: number; max: number };

/**
 * Every base turn. `quarters` follows the right-hand rule; a face turn that is
 * "clockwise seen from outside" is -1 about that face's normal.
 * Slices follow the face on their side: M follows L, E follows D, S follows F.
 */
const BASE_MOVES: Record<string, LayerDef> = {
  U: { axis: 1, quarters: -1, min: 0.5, max: 2 },
  D: { axis: 1, quarters: 1, min: -2, max: -0.5 },
  R: { axis: 0, quarters: -1, min: 0.5, max: 2 },
  L: { axis: 0, quarters: 1, min: -2, max: -0.5 },
  F: { axis: 2, quarters: -1, min: 0.5, max: 2 },
  B: { axis: 2, quarters: 1, min: -2, max: -0.5 },
  M: { axis: 0, quarters: 1, min: -0.5, max: 0.5 },
  E: { axis: 1, quarters: 1, min: -0.5, max: 0.5 },
  S: { axis: 2, quarters: -1, min: -0.5, max: 0.5 },
  r: { axis: 0, quarters: -1, min: -0.5, max: 2 },
  l: { axis: 0, quarters: 1, min: -2, max: 0.5 },
  u: { axis: 1, quarters: -1, min: -0.5, max: 2 },
  d: { axis: 1, quarters: 1, min: -2, max: 0.5 },
  f: { axis: 2, quarters: -1, min: -0.5, max: 2 },
  b: { axis: 2, quarters: 1, min: -2, max: 0.5 },
  x: { axis: 0, quarters: -1, min: -2, max: 2 },
  y: { axis: 1, quarters: -1, min: -2, max: 2 },
  z: { axis: 2, quarters: -1, min: -2, max: 2 },
};

export const BASE_MOVE_NAMES = Object.keys(BASE_MOVES);

export interface MoveTurn {
  /** 0 = x, 1 = y, 2 = z */
  axis: 0 | 1 | 2;
  /** Quarter turns, right-hand rule, in model coordinates */
  quarters: number;
  /** Whether this facelet sits in the turning layer */
  inLayer: (facelet: number) => boolean;
}

/**
 * Geometry of a move, used to animate the turning layer.
 * Returns null for an unrecognised move.
 */
export function moveTurn(move: string): MoveTurn | null {
  const suffix = move.endsWith('2') ? 2 : move.endsWith("'") ? -1 : 1;
  const base = move.replace(/['2]$/, '');
  const def = BASE_MOVES[base];
  if (!def) return null;
  return {
    axis: def.axis,
    quarters: def.quarters * suffix,
    inLayer: (facelet: number) => {
      const v = FACELET_POS[facelet][def.axis];
      return v >= def.min && v <= def.max;
    },
  };
}

/** Rotate a vector about an axis by an arbitrary angle (degrees), for partial turns. */
export function rotateVecDegrees(v: Vec3, axis: number, degrees: number): Vec3 {
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const [x, y, z] = v;
  if (axis === 0) return [x, y * c - z * s, y * s + z * c];
  if (axis === 1) return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}

function buildPerm(def: LayerDef, quarters: number): Uint8Array {
  const perm = new Uint8Array(54);
  for (let i = 0; i < 54; i++) {
    const p = FACELET_POS[i];
    const n = FACELET_NORMAL[i];
    const inLayer = p[def.axis] >= def.min && p[def.axis] <= def.max;
    const p2 = inLayer ? rotateVec(p, def.axis, quarters) : p;
    const n2 = inLayer ? rotateVec(n, def.axis, quarters) : n;
    const j = indexByKey.get(keyOf(p2, n2));
    if (j === undefined) throw new Error(`No destination facelet found for ${i}`);
    perm[j] = i; // the sticker travels from i to j
  }
  return perm;
}

/** Lookup: move name -> permutation. out[j] = state[perm[j]] */
export const MOVE_PERMS: Record<string, Uint8Array> = {};
for (const [name, def] of Object.entries(BASE_MOVES)) {
  MOVE_PERMS[name] = buildPerm(def, def.quarters);
  MOVE_PERMS[name + "'"] = buildPerm(def, -def.quarters);
  MOVE_PERMS[name + '2'] = buildPerm(def, def.quarters * 2);
}

export const IDENTITY_PERM = (() => {
  const p = new Uint8Array(54);
  for (let i = 0; i < 54; i++) p[i] = i;
  return p;
})();

/** Compose two permutations: the result applies a, then b. */
export function composePerm(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(54);
  for (let j = 0; j < 54; j++) out[j] = a[b[j]];
  return out;
}

/** The 24 whole-cube rotations, generated by BFS from x and y. */
export const ROTATIONS: Uint8Array[] = (() => {
  const seen = new Map<string, Uint8Array>();
  const queue: Uint8Array[] = [IDENTITY_PERM];
  seen.set(IDENTITY_PERM.join(','), IDENTITY_PERM);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const gen of [MOVE_PERMS['x'], MOVE_PERMS['y'], MOVE_PERMS['z']]) {
      const next = composePerm(cur, gen);
      const k = next.join(',');
      if (!seen.has(k)) {
        seen.set(k, next);
        queue.push(next);
      }
    }
  }
  return [...seen.values()];
})();
