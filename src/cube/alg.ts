/** Parsing, formatting and transforming algorithm notation. */

import { MOVE_PERMS, ROTATIONS } from './geometry';

const ALIASES: Record<string, string> = {
  Rw: 'r', Lw: 'l', Uw: 'u', Dw: 'd', Fw: 'f', Bw: 'b',
  '3Rw': 'r', '3Lw': 'l',
};

const TOKEN_RE = /^(3?[URFDLBMESxyz]w?|[rludfb])(2'?|'|)$/;

/** Split a string into valid moves. Throws on an unrecognised token. */
export function parseAlg(text: string): string[] {
  const raw = text
    .replace(/[（(].*?[）)]/g, ' ')
    .replace(/[\[\]{},/]/g, ' ')
    .replace(/[’‘`´]/g, "'")
    .replace(/２/g, '2')
    .trim();
  if (!raw) return [];
  const out: string[] = [];
  for (const tok of raw.split(/\s+/)) {
    const m = TOKEN_RE.exec(tok);
    if (!m) throw new Error(`Unrecognised move "${tok}"`);
    let base = m[1];
    base = ALIASES[base] ?? base;
    if (base.startsWith('3')) base = ALIASES[base] ?? base.slice(1);
    const suffix = m[2] === "2'" ? '2' : m[2];
    const move = base + suffix;
    if (!MOVE_PERMS[move]) throw new Error(`Unrecognised move "${tok}"`);
    out.push(move);
  }
  return out;
}

export function isValidAlg(text: string): boolean {
  try {
    parseAlg(text);
    return true;
  } catch {
    return false;
  }
}

export function formatAlg(moves: string[]): string {
  return moves.join(' ');
}

export function invertMove(move: string): string {
  if (move.endsWith('2')) return move;
  if (move.endsWith("'")) return move.slice(0, -1);
  return move + "'";
}

export function invertAlg(moves: string[]): string[] {
  return [...moves].reverse().map(invertMove);
}

/** The move's face (first letter), used to spot consecutive same-face turns. */
export function moveFace(move: string): string {
  return move[0];
}

/** The move's axis: 0 = x (R/L/M/r/l/x), 1 = y (U/D/E/u/d/y), 2 = z (F/B/S/f/b/z) */
export function moveAxis(move: string): number {
  const f = move[0];
  if ('RLMrlx'.includes(f)) return 0;
  if ('UDEudy'.includes(f)) return 1;
  return 2;
}

export function moveAmount(move: string): number {
  if (move.endsWith('2')) return 2;
  if (move.endsWith("'")) return 3;
  return 1;
}

export function makeMove(face: string, amount: number): string {
  const a = ((amount % 4) + 4) % 4;
  if (a === 0) return '';
  return face + (a === 1 ? '' : a === 2 ? '2' : "'");
}

/** Simplify a sequence: merge adjacent same-face turns, drop cancellations. */
export function simplifyAlg(moves: string[]): string[] {
  const out: string[] = [];
  for (const m of moves) {
    const prev = out[out.length - 1];
    if (prev && moveFace(prev) === moveFace(m)) {
      out.pop();
      const merged = makeMove(moveFace(m), moveAmount(prev) + moveAmount(m));
      if (merged) out.push(merged);
    } else {
      out.push(m);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Reading moves in a different frame
 * ------------------------------------------------------------------ */

const NOTATION = ['U', 'R', 'F', 'D', 'L', 'B', 'M', 'E', 'S'].flatMap((f) => [f, f + "'", f + '2']);
const ROTATION_NAMES = ['x', "x'", 'x2', 'y', "y'", 'y2', 'z', "z'", 'z2'];
const permKey = (p: Uint8Array) => p.join(',');
const BY_PERM = new Map<string, string>();
for (const m of NOTATION) BY_PERM.set(permKey(MOVE_PERMS[m]), m);

function invert(p: Uint8Array): Uint8Array {
  const out = new Uint8Array(54);
  for (let i = 0; i < 54; i++) out[p[i]] = i;
  return out;
}

const frameCache = new Map<string, Map<string, string>>();

/**
 * The same physical turn, named as someone looking at the cube through `rot`
 * would name it.
 *
 * Viewing is `t[a] = s[rot[a]]`, so a move P in the raw frame is the move
 * `rot⁻¹ ∘ P ∘ rot` in the viewed one. Returns the move unchanged if the result
 * is not a move that has a name (which cannot happen for a real rotation).
 */
export function moveInFrame(move: string, rot: Uint8Array): string {
  const key = permKey(rot);
  let table = frameCache.get(key);
  if (!table) {
    table = new Map();
    const inv = invert(rot);
    for (const m of NOTATION) {
      const p = MOVE_PERMS[m];
      const out = new Uint8Array(54);
      for (let a = 0; a < 54; a++) out[a] = inv[p[rot[a]]];
      const named = BY_PERM.get(permKey(out));
      if (named) table.set(m, named);
    }
    frameCache.set(key, table);
  }
  return table.get(move) ?? move;
}

/**
 * Name the whole-cube rotation that turns frame `from` into frame `to`, as the
 * solver would write it (`y`, `x'`, `z2`, or a pair like `x y`). Empty when the
 * two frames are the same.
 *
 * The cube cannot sense rotations at all — they turn no face relative to the
 * core — so this is inferred from the frame the steps were recognised in, not
 * measured.
 */
export function rotationBetween(from: Uint8Array, to: Uint8Array): string[] {
  if (permKey(from) === permKey(to)) return [];
  const inv = invert(from);
  const want = new Uint8Array(54);
  for (let a = 0; a < 54; a++) want[a] = to[inv[a]];
  const target = permKey(want);
  for (const r of ROTATION_NAMES) if (permKey(MOVE_PERMS[r]) === target) return [r];
  for (const a of ROTATION_NAMES) {
    for (const b of ROTATION_NAMES) {
      const p = new Uint8Array(54);
      for (let i = 0; i < 54; i++) p[i] = MOVE_PERMS[a][MOVE_PERMS[b][i]];
      if (permKey(p) === target) return [a, b];
    }
  }
  return [];
}

/** Is this permutation one of the 24 whole-cube rotations? */
export function isRotationPerm(p: Uint8Array): boolean {
  const k = permKey(p);
  return ROTATIONS.some((r) => permKey(r) === k);
}
