/** Đọc / ghi / biến đổi ký hiệu thuật toán. */

import { MOVE_PERMS } from './geometry';

const ALIASES: Record<string, string> = {
  Rw: 'r', Lw: 'l', Uw: 'u', Dw: 'd', Fw: 'f', Bw: 'b',
  '3Rw': 'r', '3Lw': 'l',
};

const TOKEN_RE = /^(3?[URFDLBMESxyz]w?|[rludfb])(2'?|'|)$/;

/** Tách chuỗi thành danh sách nước hợp lệ. Ném lỗi nếu gặp token lạ. */
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
    if (!m) throw new Error(`Không hiểu nước "${tok}"`);
    let base = m[1];
    base = ALIASES[base] ?? base;
    if (base.startsWith('3')) base = ALIASES[base] ?? base.slice(1);
    const suffix = m[2] === "2'" ? '2' : m[2];
    const move = base + suffix;
    if (!MOVE_PERMS[move]) throw new Error(`Không hiểu nước "${tok}"`);
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

/** Mặt (chữ cái đầu) của nước, dùng để phát hiện nước cùng mặt. */
export function moveFace(move: string): string {
  return move[0];
}

/** Trục quay của nước: 0 = x (R/L/M/r/l/x), 1 = y (U/D/E/u/d/y), 2 = z (F/B/S/f/b/z) */
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

/** Rút gọn chuỗi: gộp nước liền kề cùng mặt, bỏ nước triệt tiêu. */
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
