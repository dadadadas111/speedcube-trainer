/**
 * Xử lý dòng nước thô từ smart cube.
 *
 * Cảm biến GAN chỉ đo được vòng quay của 6 mặt so với LÕI cube. Vì lõi quay theo
 * lát giữa nên:
 *   - Nước M được báo về thành hai sự kiện gần như đồng thời: R và L'
 *   - Nước rộng r được báo về thành L (không cách nào phân biệt với L thật)
 *   - Các phép xoay khối x/y/z hoàn toàn không sinh sự kiện
 *
 * Module này dựng ngược lại chuỗi nước "như người giải nghĩ" từ chuỗi "như cảm
 * biến báo" — chính là hàm nghịch đảo của cube/sensorSim.ts.
 *
 * CHỖ DỄ SAI NHẤT: đồng nhất thức đầy đủ là `M = R L' x'`. Gộp R + L' thành M mà
 * quên vế x' thì mô hình bị xoay đi, trong khi mọi nước SAU đó vẫn được áp theo
 * hệ quy chiếu cũ — trạng thái hỏng hoàn toàn chứ không chỉ lệch một phép quay.
 * Nên mỗi lần gộp được một lát cắt, tất cả các nước còn lại phải được liên hợp
 * theo phép quay tương ứng.
 */

import { moveFace, moveAmount, makeMove } from './alg';
import { MOVE_PERMS, composePerm, IDENTITY_PERM } from './geometry';

export interface TimedMove {
  /** Ký hiệu nước, ví dụ "R'" hoặc "M2" */
  move: string;
  /** Mốc thời gian tính bằng ms kể từ lúc bắt đầu solve */
  t: number;
  /** Nước này được ghép từ mấy sự kiện thô (dùng để hiệu chỉnh thống kê) */
  merged?: number;
}

/** cặp (mặt A + hướng, mặt B + hướng) -> nước lát cắt, và phép quay mà lõi bị lệch */
const SLICE_PAIRS: Record<string, { slice: string; rot: string }> = {
  "R|L'": { slice: 'M', rot: "x'" },
  "R'|L": { slice: "M'", rot: 'x' },
  'R2|L2': { slice: 'M2', rot: 'x2' },
  "U|D'": { slice: 'E', rot: "y'" },
  "U'|D": { slice: "E'", rot: 'y' },
  'U2|D2': { slice: 'E2', rot: 'y2' },
  "F'|B": { slice: 'S', rot: 'z' },
  "F|B'": { slice: "S'", rot: "z'" },
  'F2|B2': { slice: 'S2', rot: 'z2' },
};

function slicePair(a: string, b: string) {
  return SLICE_PAIRS[`${a}|${b}`] ?? SLICE_PAIRS[`${b}|${a}`] ?? null;
}

const FACE_MOVES = ['U', 'R', 'F', 'D', 'L', 'B'].flatMap((f) => [f, f + "'", f + '2']);
const permKey = (p: Uint8Array) => p.join(',');
const FACE_BY_PERM = new Map(FACE_MOVES.map((m) => [permKey(MOVE_PERMS[m]), m]));

function invertPerm(p: Uint8Array): Uint8Array {
  const out = new Uint8Array(54);
  for (let i = 0; i < 54; i++) out[p[i]] = i;
  return out;
}

/**
 * Nước mặt mà cảm biến báo là `reported`, thật ra là nước gì trong hệ quy chiếu
 * của người giải khi lõi đã lệch đi `drift`. Đây là phép nghịch đảo của phép
 * liên hợp trong sensorSim.
 */
function unconjugate(reported: string, drift: Uint8Array): string {
  const p = composePerm(composePerm(drift, MOVE_PERMS[reported]), invertPerm(drift));
  return FACE_BY_PERM.get(permKey(p)) ?? reported;
}

export interface CleanupOptions {
  /**
   * Cửa sổ gộp hai nửa của một nước lát cắt (ms). Trên cube thật hai lớp không
   * bao giờ quay đúng cùng lúc — đo trên solve thật thấy chênh tới ~120ms.
   */
  sliceWindow?: number;
  /** Cửa sổ gộp hai nước cùng mặt thành nước 180 (ms) */
  doubleWindow?: number;
}

/**
 * Chuẩn hoá dòng nước: dựng lại nước lát cắt, gộp nước đôi, bỏ nước triệt tiêu.
 * Trả về danh sách mới, không đụng vào mảng gốc.
 *
 * Kết quả sai khác trạng thái thật đúng một phép quay toàn khối (do không thể
 * biết người giải có xoay khối trong tay hay không), điều mà mọi phần phân tích
 * phía sau đều chịu được vì chúng kiểm tra trên cả 24 hướng.
 */
export function cleanMoveStream(moves: TimedMove[], opts: CleanupOptions = {}): TimedMove[] {
  const sliceWindow = opts.sliceWindow ?? 140;
  const doubleWindow = opts.doubleWindow ?? 160;

  // Bước 1: dựng lại lát cắt, đồng thời liên hợp phần còn lại theo phép quay của lõi
  const sliced: TimedMove[] = [];
  let drift: Uint8Array = IDENTITY_PERM as Uint8Array;
  for (let i = 0; i < moves.length; i++) {
    const cur = unconjugate(moves[i].move, drift);
    const next = moves[i + 1];
    if (next && next.t - moves[i].t <= sliceWindow) {
      const pair = slicePair(cur, unconjugate(next.move, drift));
      if (pair) {
        sliced.push({ move: pair.slice, t: next.t, merged: 2 });
        drift = composePerm(invertPerm(MOVE_PERMS[pair.rot]), drift);
        i++;
        continue;
      }
    }
    sliced.push({ move: cur, t: moves[i].t });
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
