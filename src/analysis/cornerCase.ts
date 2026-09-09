/**
 * Nhận dạng case mà một alg lớp cuối giải, thuần bằng tính toán.
 *
 * Dùng để tự xếp alg vào đúng họ khi người dùng thêm alg mới, và để phát hiện
 * hai alg thật ra cùng giải một case. Không dựa vào tên do con người đặt.
 *
 * Chữ ký được chuẩn hoá theo AUF: xoay lớp U trước khi làm alg không tạo ra case
 * khác. Cách làm là mã hoá mỗi ô góc bằng ĐỘ LỆCH so với chỗ về đích của nó chứ
 * không phải vị trí tuyệt đối, rồi lấy giá trị nhỏ nhất qua 4 phép xoay.
 */

import { SOLVED_STATE, applyMoves, PIECES, groupSolved, type CubeState } from '../cube/cube';
import { ROTATIONS, FACELET_NORMAL, faceletsOfCubie, type Vec3 } from '../cube/geometry';
import { invertAlg } from '../cube/alg';

/** Bốn ô góc lớp U, theo vòng quanh mặt U. */
const U_CORNER_SLOTS: Vec3[] = [
  [-1, 1, -1], // sau-trái
  [1, 1, -1],  // sau-phải
  [1, 1, 1],   // trước-phải
  [-1, 1, 1],  // trước-trái
];

const det3 = (a: readonly number[], b: readonly number[], c: readonly number[]) =>
  a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);

/**
 * Ba facelet của mỗi ô góc, xếp theo cùng một chiều xoay cho cả bốn góc.
 * Chọn thứ tự sao cho định thức của ba pháp tuyến dương — nhờ vậy "hướng xoay 1"
 * mang cùng ý nghĩa ở mọi góc.
 */
const SLOT_FACELETS: number[][] = U_CORNER_SLOTS.map((pos) => {
  const fs = faceletsOfCubie(pos);
  const [a, b, c] = fs;
  const n = (i: number) => FACELET_NORMAL[i];
  return det3(n(a), n(b), n(c)) > 0 ? [a, b, c] : [a, c, b];
});

/** Bộ màu về đích của từng ô góc (chính là chỉ số mặt của ba facelet). */
const SLOT_HOME_COLORS: string[] = SLOT_FACELETS.map((fs) =>
  fs.map((i) => Math.floor(i / 9)).sort((x, y) => x - y).join(''),
);

export interface CornerCase {
  /** Chữ ký hướng bốn góc — chính là "họ" (nhóm OCLL) */
  family: string;
  /** Chữ ký đầy đủ gồm cả hoán vị: hai alg cùng chữ ký này giải cùng một case */
  full: string;
  /** Alg có giữ nguyên hai khối Roux không */
  preservesBlocks: boolean;
  /** Alg có chỉ đụng bốn góc lớp U không (cạnh lớp U được phép xê dịch) */
  cornersOnly: boolean;
}

/** Đọc (độ lệch vị trí, hướng xoay) của bốn ô góc lớp U. */
function readCorners(s: CubeState): { offset: number; twist: number }[] | null {
  const out: { offset: number; twist: number }[] = [];
  for (let slot = 0; slot < 4; slot++) {
    const fs = SLOT_FACELETS[slot];
    const colors = fs.map((i) => s[i]);
    const home = SLOT_HOME_COLORS.indexOf([...colors].sort((a, b) => a - b).join(''));
    if (home < 0) return null; // miếng ở đây không phải góc lớp U -> alg không thuộc dạng này
    // hướng xoay = vị trí của mặt màu U (hoặc D) trong bộ ba đã xếp theo chiều
    const twist = colors.findIndex((c) => c === 0 || c === 3);
    if (twist < 0) return null;
    out.push({ offset: (home - slot + 4) % 4, twist });
  }
  return out;
}

/**
 * Chữ ký nhỏ nhất qua bốn phép xoay lớp U.
 *
 * Xoay U một nhịp làm hai việc cùng lúc: dịch vòng các ô góc, VÀ giảm độ lệch
 * của mọi miếng đi một (vì miếng sang ô kế tiếp thì còn cách đích gần hơn một
 * nhịp). Bỏ sót vế thứ hai là hai cách viết cùng một case sẽ ra hai chữ ký khác
 * nhau.
 */
function canonicalize(corners: { offset: number; twist: number }[]): { family: string; full: string } {
  let bestFull = '';
  let bestFamily = '';
  for (let k = 0; k < 4; k++) {
    let full = '';
    let family = '';
    for (let i = 0; i < 4; i++) {
      const src = corners[(i - k + 4) % 4];
      full += `${(src.offset - k + 4) % 4}${src.twist}`;
      family += String(src.twist);
    }
    if (bestFull === '' || full < bestFull) bestFull = full;
    if (bestFamily === '' || family < bestFamily) bestFamily = family;
  }
  return { family: bestFamily, full: bestFull };
}

/**
 * Phân loại case mà `alg` giải. Case đó chính là trạng thái thu được khi làm
 * ngược alg từ khối đã giải.
 */
export function classifyCornerAlg(alg: string[]): CornerCase | null {
  if (!alg.length) return null;
  const caseState = applyMoves(SOLVED_STATE, invertAlg(alg));
  const corners = readCorners(caseState);
  if (!corners) return null;

  const identity = ROTATIONS.find((r) => r.every((v, i) => v === i))!;
  const blocks = groupSolved(caseState, identity, PIECES.FB) && groupSolved(caseState, identity, PIECES.SB);
  // "chỉ đụng góc" = ngoài bốn góc U và sáu cạnh LSE ra thì mọi thứ y nguyên
  const untouched = PIECES.ALL.filter(
    (i) => !PIECES.U_CORNERS.includes(i) && !PIECES.LSE_EDGES.includes(i) && i !== 4,
  );
  const cornersOnly = untouched.every((i) => caseState[i] === Math.floor(i / 9));

  return {
    ...canonicalize(corners),
    preservesBlocks: blocks,
    cornersOnly,
  };
}

/** Tên gợi ý cho họ, suy ra từ dạng xoay của bốn góc. */
export function describeFamily(family: string): string {
  const twists = [...family].map(Number);
  const oriented = twists.filter((t) => t === 0).length;
  if (oriented === 4) return 'bốn góc đã đúng hướng';
  if (oriented === 1) return 'ba góc xoay cùng chiều';
  if (oriented === 2) return 'hai góc đúng hướng, hai góc xoay';
  return 'cả bốn góc đều xoay';
}
