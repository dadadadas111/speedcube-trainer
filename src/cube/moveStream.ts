/**
 * Xử lý dòng nước thô từ smart cube.
 *
 * Cảm biến GAN chỉ đo được vòng quay của 6 mặt so với lõi. Vì lõi quay theo lát
 * giữa nên:
 *   - Nước M được báo về thành hai sự kiện gần như đồng thời: R và L'
 *   - Nước rộng r được báo về thành L (không cách nào phân biệt với L thật)
 *   - Các phép xoay khối x/y/z hoàn toàn không sinh sự kiện
 *
 * Module này gộp các cặp mặt đối nhau thành nước lát cắt để ký hiệu đọc được
 * (rất quan trọng với Roux vì LSE toàn M), và gộp hai nước cùng mặt thành nước 180.
 */

import { moveFace, moveAmount, makeMove } from './alg';

export interface TimedMove {
  /** Ký hiệu nước, ví dụ "R'" hoặc "M2" */
  move: string;
  /** Mốc thời gian tính bằng ms kể từ lúc bắt đầu solve */
  t: number;
  /** Nước này được ghép từ mấy sự kiện thô (dùng để hiệu chỉnh thống kê) */
  merged?: number;
}

/** cặp (mặt A + hướng, mặt B + hướng) -> nước lát cắt */
const SLICE_PAIRS: Record<string, string> = {
  "R|L'": 'M', "R'|L": "M'", 'R2|L2': 'M2',
  "U|D'": 'E', "U'|D": "E'", 'U2|D2': 'E2',
  "F'|B": 'S', "F|B'": "S'", 'F2|B2': 'S2',
};

function slicePair(a: string, b: string): string | null {
  return SLICE_PAIRS[`${a}|${b}`] ?? SLICE_PAIRS[`${b}|${a}`] ?? null;
}

export interface CleanupOptions {
  /** Cửa sổ gộp hai nửa của một nước lát cắt (ms) */
  sliceWindow?: number;
  /** Cửa sổ gộp hai nước cùng mặt thành nước 180 (ms) */
  doubleWindow?: number;
}

/**
 * Chuẩn hoá dòng nước: gộp lát cắt, gộp nước đôi, bỏ rung cảm biến.
 * Trả về danh sách mới, không đụng vào mảng gốc.
 */
export function cleanMoveStream(moves: TimedMove[], opts: CleanupOptions = {}): TimedMove[] {
  const sliceWindow = opts.sliceWindow ?? 45;
  const doubleWindow = opts.doubleWindow ?? 150;

  // Bước 1: gộp cặp mặt đối nhau thành lát cắt
  const sliced: TimedMove[] = [];
  for (let i = 0; i < moves.length; i++) {
    const cur = moves[i];
    const next = moves[i + 1];
    if (next && next.t - cur.t <= sliceWindow) {
      const s = slicePair(cur.move, next.move);
      if (s) {
        sliced.push({ move: s, t: next.t, merged: 2 });
        i++;
        continue;
      }
    }
    sliced.push({ ...cur });
  }

  // Bước 2: gộp hai nước liền kề cùng mặt (R R -> R2, M M -> M2, R R' -> bỏ)
  const out: TimedMove[] = [];
  for (const m of sliced) {
    const prev = out[out.length - 1];
    if (prev && moveFace(prev.move) === moveFace(m.move) && m.t - prev.t <= doubleWindow) {
      const merged = makeMove(moveFace(m.move), moveAmount(prev.move) + moveAmount(m.move));
      out.pop();
      if (merged) out.push({ move: merged, t: m.t, merged: (prev.merged ?? 1) + (m.merged ?? 1) });
      continue;
    }
    out.push(m);
  }
  return out;
}

/** Số nước theo cách đếm HTM (nước 180 tính là 1). */
export function htmCount(moves: TimedMove[]): number {
  return moves.length;
}
