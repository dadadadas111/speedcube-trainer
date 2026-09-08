/**
 * Mô phỏng cách cảm biến của smart cube báo nước về.
 *
 * Cảm biến chỉ đo được vòng quay của 6 mặt so với LÕI cube. Nước lát cắt và
 * nước rộng làm chính cái lõi quay, nên:
 *   M  -> báo về thành hai sự kiện R và L'
 *   r  -> báo về thành L
 *   x/y/z -> không sinh sự kiện nào
 * và quan trọng nhất: mọi nước SAU đó đều bị đổi hệ quy chiếu theo.
 *
 * Dùng cho test và cho chế độ demo bằng bàn phím.
 */

import { MOVE_PERMS, composePerm, IDENTITY_PERM } from './geometry';

/** nước -> (các nước mặt mà cảm biến thấy) + (phép quay mà lõi bị lệch) */
const DECOMPOSITION: Record<string, { faces: string[]; rot: string | null }> = {
  M: { faces: ['R', "L'"], rot: "x'" }, "M'": { faces: ["R'", 'L'], rot: 'x' }, M2: { faces: ['R2', 'L2'], rot: 'x2' },
  E: { faces: ['U', "D'"], rot: "y'" }, "E'": { faces: ["U'", 'D'], rot: 'y' }, E2: { faces: ['U2', 'D2'], rot: 'y2' },
  S: { faces: ["F'", 'B'], rot: 'z' }, "S'": { faces: ['F', "B'"], rot: "z'" }, S2: { faces: ['F2', 'B2'], rot: 'z2' },
  r: { faces: ['L'], rot: 'x' }, "r'": { faces: ["L'"], rot: "x'" }, r2: { faces: ['L2'], rot: 'x2' },
  l: { faces: ['R'], rot: "x'" }, "l'": { faces: ["R'"], rot: 'x' }, l2: { faces: ['R2'], rot: 'x2' },
  u: { faces: ['D'], rot: 'y' }, "u'": { faces: ["D'"], rot: "y'" }, u2: { faces: ['D2'], rot: 'y2' },
  d: { faces: ['U'], rot: "y'" }, "d'": { faces: ["U'"], rot: 'y' }, d2: { faces: ['U2'], rot: 'y2' },
  f: { faces: ['B'], rot: 'z' }, "f'": { faces: ["B'"], rot: "z'" }, f2: { faces: ['B2'], rot: 'z2' },
  b: { faces: ['F'], rot: "z'" }, "b'": { faces: ["F'"], rot: 'z' }, b2: { faces: ['F2'], rot: 'z2' },
  x: { faces: [], rot: 'x' }, "x'": { faces: [], rot: "x'" }, x2: { faces: [], rot: 'x2' },
  y: { faces: [], rot: 'y' }, "y'": { faces: [], rot: "y'" }, y2: { faces: [], rot: 'y2' },
  z: { faces: [], rot: 'z' }, "z'": { faces: [], rot: "z'" }, z2: { faces: [], rot: 'z2' },
};

const FACE_MOVES = ['U', 'R', 'F', 'D', 'L', 'B'].flatMap((f) => [f, f + "'", f + '2']);
const permKey = (p: Uint8Array) => p.join(',');
const FACE_BY_PERM = new Map(FACE_MOVES.map((m) => [permKey(MOVE_PERMS[m]), m]));

function invertPerm(p: Uint8Array): Uint8Array {
  const o = new Uint8Array(54);
  for (let i = 0; i < 54; i++) o[p[i]] = i;
  return o;
}

/** Nước mặt `m` trông như thế nào trong hệ quy chiếu của lõi đã lệch `drift`. */
function conjugate(m: string, drift: Uint8Array): string {
  const p = composePerm(composePerm(invertPerm(drift), MOVE_PERMS[m]), drift);
  const name = FACE_BY_PERM.get(permKey(p));
  if (!name) throw new Error(`Liên hợp không ra nước mặt: ${m}`);
  return name;
}

/** Chuyển một chuỗi nước "như người giải nghĩ" thành chuỗi "như cảm biến báo". */
export function simulateSensorStream(moves: string[]): string[] {
  let drift: Uint8Array = IDENTITY_PERM as Uint8Array;
  const out: string[] = [];
  for (const m of moves) {
    const d = DECOMPOSITION[m] ?? { faces: [m], rot: null };
    for (const f of d.faces) out.push(conjugate(f, drift));
    if (d.rot) drift = composePerm(invertPerm(MOVE_PERMS[d.rot]), drift);
  }
  return out;
}
