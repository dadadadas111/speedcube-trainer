/** Mô hình trạng thái rubik dạng 54 facelet + các phép kiểm tra. */

import { MOVE_PERMS, ROTATIONS, faceletsOfCubie, type Vec3 } from './geometry';

/** Màu: 0=U 1=R 2=F 3=D 4=L 5=B (theo thứ tự mặt chuẩn Kociemba). */
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
  if (!perm) throw new Error(`Nước không hợp lệ: ${move}`);
  return applyPerm(s, perm);
}

export function applyMoves(s: CubeState, moves: string[]): CubeState {
  let cur = s;
  for (const m of moves) cur = applyMove(cur, m);
  return cur;
}

/** Toàn bộ chuỗi trạng thái: index i = trạng thái sau i nước. */
export function stateSequence(start: CubeState, moves: string[]): CubeState[] {
  const out: CubeState[] = [cloneState(start)];
  let cur = start;
  for (const m of moves) {
    cur = applyMove(cur, m);
    out.push(cur);
  }
  return out;
}

/** Đã giải xong: mỗi mặt một màu (không quan tâm khối đang xoay hướng nào). */
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
 * Khoá chuẩn hoá bất biến với phép quay toàn khối.
 * Cần thiết vì cảm biến của smart cube không phân biệt được R với l, hay M với
 * R L' — mọi mơ hồ đó chỉ khác nhau đúng một phép quay toàn khối.
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
 * Trạng thái có hợp lệ về mặt số lượng màu không: mỗi màu đúng 9 ô.
 *
 * Dùng để bắt trường hợp nhập sai địa chỉ MAC của smart cube: khi đó dữ liệu
 * giải mã ra rác, cube trông như đã kết nối nhưng mọi thứ đọc về đều vô nghĩa.
 * Kiểm tra này không xác nhận khối có giải được hay không, chỉ chặn rác.
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
    if (c < 0) throw new Error(`Ký tự facelet lạ: ${str[i]}`);
    s[i] = c;
  }
  return s;
}

/* ---------- Định nghĩa các nhóm miếng dùng cho phân tích ---------- */

const F = (pos: Vec3) => faceletsOfCubie(pos);

export const PIECES = {
  /** First Block của Roux: khối 1x2x3 bên trái dưới (không tính tâm L). */
  FB: [F([-1, -1, -1]), F([-1, -1, 0]), F([-1, -1, 1]), F([-1, 0, -1]), F([-1, 0, 1])].flat(),
  /** Second Block: khối 1x2x3 bên phải dưới. */
  SB: [F([1, -1, -1]), F([1, -1, 0]), F([1, -1, 1]), F([1, 0, -1]), F([1, 0, 1])].flat(),
  /** 4 góc lớp U (CMLL). */
  U_CORNERS: [F([-1, 1, -1]), F([-1, 1, 1]), F([1, 1, -1]), F([1, 1, 1])].flat(),
  /** Cạnh UL và UR (bước 4b của LSE). */
  UL_UR: [F([-1, 1, 0]), F([1, 1, 0])].flat(),
  /** 6 cạnh của LSE. */
  LSE_EDGES: [F([-1, 1, 0]), F([1, 1, 0]), F([0, 1, 1]), F([0, 1, -1]), F([0, -1, 1]), F([0, -1, -1])].flat(),
  /** Cross của CFOP (4 cạnh lớp D). */
  CROSS: [F([0, -1, 1]), F([0, -1, -1]), F([-1, -1, 0]), F([1, -1, 0])].flat(),
  ALL: Array.from({ length: 54 }, (_, i) => i),
};

/** 4 slot F2L, mỗi slot = 1 góc D + 1 cạnh giữa. */
export const F2L_SLOTS: number[][] = [
  [...F([1, -1, 1]), ...F([1, 0, 1])], // FR
  [...F([1, -1, -1]), ...F([1, 0, -1])], // BR
  [...F([-1, -1, -1]), ...F([-1, 0, -1])], // BL
  [...F([-1, -1, 1]), ...F([-1, 0, 1])], // FL
];

const onUD = (xs: number[]) => xs.filter((i) => i < 9 || (i >= 27 && i < 36));

/** Facelet trên mặt U của hai cạnh UL, UR — hai cạnh này nằm ngoài lát M. */
export const LSE_SIDE_UD_FACELETS: number[] = onUD([...F([-1, 1, 0]), ...F([1, 1, 0])]);

/** Facelet trên mặt U/D của bốn cạnh trong lát M (UF, UB, DF, DB). */
export const LSE_SLICE_UD_FACELETS: number[] = onUD([
  ...F([0, 1, 1]), ...F([0, 1, -1]), ...F([0, -1, 1]), ...F([0, -1, -1]),
]);

/** Facelet trên mặt U/D của cả 6 cạnh LSE. */
export const LSE_UD_FACELETS: number[] = [...LSE_SIDE_UD_FACELETS, ...LSE_SLICE_UD_FACELETS];

export const U_CENTER_FACELET = 4;

/**
 * Kiểm tra một nhóm facelet đã đúng chỗ chưa, khi nhìn khối qua phép quay `rot`.
 * `rot` biến hệ quy chiếu của người giải về hệ chuẩn (U trên, L trái...).
 */
export function groupSolved(s: CubeState, rot: Uint8Array, facelets: number[]): boolean {
  for (const a of facelets) {
    if (s[rot[a]] !== Math.floor(a / 9)) return false;
  }
  return true;
}
