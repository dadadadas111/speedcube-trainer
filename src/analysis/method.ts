/**
 * Phát hiện các bước giải từ dòng nước.
 *
 * Điểm mấu chốt: mọi điều kiện đều được kiểm tra trên CẢ 24 hướng cầm khối
 * ("tồn tại một hướng sao cho..."). Nhờ vậy điều kiện bất biến với phép quay
 * toàn khối — cần thiết vì smart cube không phân biệt được r với L, nên hệ quy
 * chiếu của mô hình có thể lệch dần so với thực tế trong lúc giải.
 */

import { type CubeState, PIECES, F2L_SLOTS, LSE_UD_FACELETS, U_CENTER_FACELET, groupSolved, isSolved } from '../cube/cube';
import { ROTATIONS, MOVE_PERMS, composePerm, IDENTITY_PERM } from '../cube/geometry';

/**
 * 24 hướng cầm khối, nhân thêm 4 vị trí xoay của lớp U.
 *
 * Cần cho các bước LSE: lúc đó người giải xoay lớp U liên tục, nên bốn góc tuy
 * đã giải xong về mặt CMLL nhưng hiếm khi đang nằm đúng vị trí cuối cùng. Nếu
 * đòi đúng cả AUF thì EO và 4b gần như không bao giờ khớp cho tới khi giải hết,
 * và toàn bộ LSE bị dồn thành một cục.
 *
 * Xoay lớp U không đụng tới hai khối nên dùng bộ này cho các bước đó vẫn an toàn.
 */
export const ROTATIONS_WITH_AUF: Uint8Array[] = (() => {
  const out: Uint8Array[] = [];
  const seen = new Set<string>();
  for (const rot of ROTATIONS) {
    let u: Uint8Array = IDENTITY_PERM as Uint8Array;
    for (let k = 0; k < 4; k++) {
      // Soi qua hướng cầm khối TRƯỚC, rồi mới xoay lớp U — ngược thứ tự thì
      // hoá ra đang xoay lớp U của hệ quy chiếu thô chứ không phải của người giải.
      const p = composePerm(rot, u);
      const key = p.join(',');
      if (!seen.has(key)) {
        seen.add(key);
        out.push(p);
      }
      u = composePerm(u, MOVE_PERMS['U']);
    }
  }
  return out;
})();

export type MethodName = 'roux' | 'cfop';

export interface StageSpec {
  key: string;
  label: string;
  /** Mô tả ngắn để hiện trong phần đánh giá */
  hint: string;
  test: (s: CubeState, rot: Uint8Array) => boolean;
  /**
   * Cho phép lớp U đang ở vị trí xoay bất kỳ. Bật cho các bước LSE, vì lúc đó
   * lớp U xoay liên tục nhưng bốn góc vẫn coi như đã xong.
   */
  allowAuf?: boolean;
}

const rouxFB = (s: CubeState, rot: Uint8Array) => groupSolved(s, rot, PIECES.FB);
const rouxSB = (s: CubeState, rot: Uint8Array) => rouxFB(s, rot) && groupSolved(s, rot, PIECES.SB);
const rouxCMLL = (s: CubeState, rot: Uint8Array) => rouxSB(s, rot) && groupSolved(s, rot, PIECES.U_CORNERS);

const facesUD = (s: CubeState, rot: Uint8Array, f: number) => {
  const c = s[rot[f]];
  return c === 0 || c === 3;
};

/**
 * EO xong: cả 6 cạnh LSE đúng chiều (mặt màu U/D nằm trên mặt U hoặc D) và lát
 * M đang thẳng hàng (tâm U nằm ở mặt U hoặc mặt D).
 *
 * Lý do phải có điều kiện thẳng hàng: tập "EO xong" bắt buộc phải bất biến dưới
 * nhóm nước của bước 4b là ⟨M2, U⟩ — làm xong 4a rồi thì cả bước 4b không được
 * phá EO. Điều kiện này bất biến đúng như vậy (U giữ nguyên chiều từng cạnh, M2
 * giữ cả chiều lẫn tính chẵn của lát giữa).
 *
 * Một tiêu chí nới hơn kiểu "chấp nhận cả khi lát M lệch 90 độ" thì KHÔNG bất
 * biến dưới U: một nước U sẽ trộn cạnh của lát M với cạnh UL/UR, tạo ra trạng
 * thái nửa đúng nửa sai. Đã kiểm tra bằng cách duyệt toàn bộ 184320 trạng thái
 * của nhóm ⟨M, U⟩ (xem test).
 */
export const rouxEdgesOriented = (s: CubeState, rot: Uint8Array) => {
  if (!facesUD(s, rot, U_CENTER_FACELET)) return false;
  for (const f of LSE_UD_FACELETS) if (!facesUD(s, rot, f)) return false;
  return true;
};

const rouxEO = (s: CubeState, rot: Uint8Array) => rouxCMLL(s, rot) && rouxEdgesOriented(s, rot);

/** 4b xong: chỉ còn lát M chưa xong (UL/UR đã vào chỗ). */
const rouxLR = (s: CubeState, rot: Uint8Array) =>
  rouxCMLL(s, rot) && groupSolved(s, rot, PIECES.UL_UR);

export const ROUX_STAGES: StageSpec[] = [
  { key: 'FB', label: 'First Block', hint: 'Khối 1x2x3 bên trái — chủ yếu là nhìn trước và lập kế hoạch', test: rouxFB },
  { key: 'SB', label: 'Second Block', hint: 'Khối 1x2x3 bên phải — nhìn trước + hiệu quả r/M', test: rouxSB },
  { key: 'CMLL', label: 'CMLL', hint: 'Xoay + hoán vị 4 góc lớp trên — nhận dạng + thuộc alg', test: rouxCMLL },
  { key: 'EO', label: 'LSE 4a (EO)', hint: 'Chỉnh chiều 6 cạnh còn lại', test: rouxEO, allowAuf: true },
  { key: 'LR', label: 'LSE 4b (UL/UR)', hint: 'Đưa hai cạnh UL, UR về chỗ', test: rouxLR, allowAuf: true },
  { key: 'L4C', label: 'LSE 4c (lát M)', hint: 'Hoàn tất lát giữa', test: (s) => isSolved(s) },
];

const cfopCross = (s: CubeState, rot: Uint8Array) => groupSolved(s, rot, PIECES.CROSS);
const slotsDone = (s: CubeState, rot: Uint8Array) =>
  F2L_SLOTS.reduce((n, slot) => n + (groupSolved(s, rot, slot) ? 1 : 0), 0);
const cfopF2L = (n: number) => (s: CubeState, rot: Uint8Array) => cfopCross(s, rot) && slotsDone(s, rot) >= n;
const cfopOLL = (s: CubeState, rot: Uint8Array) => {
  if (!cfopF2L(4)(s, rot)) return false;
  for (let i = 0; i < 9; i++) if (s[rot[i]] !== 0) return false;
  return true;
};

export const CFOP_STAGES: StageSpec[] = [
  { key: 'CROSS', label: 'Cross', hint: 'Nên giải xong trong ~8 nước và nhìn trước được cặp F2L đầu', test: cfopCross },
  { key: 'F2L1', label: 'F2L #1', hint: '', test: cfopF2L(1) },
  { key: 'F2L2', label: 'F2L #2', hint: '', test: cfopF2L(2) },
  { key: 'F2L3', label: 'F2L #3', hint: '', test: cfopF2L(3) },
  { key: 'F2L4', label: 'F2L #4', hint: 'Nhìn trước là chính, đừng dừng giữa các cặp', test: cfopF2L(4) },
  { key: 'OLL', label: 'OLL', hint: 'Nhận dạng + thuộc alg', test: cfopOLL },
  { key: 'PLL', label: 'PLL', hint: 'Nhận dạng + thuộc alg', test: (s) => isSolved(s) },
];

export function stagesFor(method: MethodName): StageSpec[] {
  return method === 'cfop' ? CFOP_STAGES : ROUX_STAGES;
}

export interface StageDetection {
  key: string;
  label: string;
  hint: string;
  /** Số nước đã thực hiện khi bước này xong; -1 nếu không phát hiện được */
  endIndex: number;
  /** Hướng cầm khối tìm được (dùng để hiển thị), null nếu không có */
  rotation: Uint8Array | null;
}

/**
 * Quét tiến, đơn điệu: bước sau không thể xong trước bước trước.
 * Với mỗi bước lấy thời điểm SỚM NHẤT thoả mãn kể từ khi bước trước xong.
 */
export function detectStages(states: CubeState[], specs: StageSpec[]): StageDetection[] {
  const out: StageDetection[] = [];
  let from = 0;
  for (const spec of specs) {
    let found = -1;
    let rotation: Uint8Array | null = null;
    const frames = spec.allowAuf ? ROTATIONS_WITH_AUF : ROTATIONS;
    for (let i = from; i < states.length && found < 0; i++) {
      for (const rot of frames) {
        if (spec.test(states[i], rot)) {
          found = i;
          rotation = rot;
          break;
        }
      }
    }
    out.push({ key: spec.key, label: spec.label, hint: spec.hint, endIndex: found, rotation });
    if (found < 0) {
      // Không phát hiện được -> các bước sau cũng bỏ trống
      from = states.length;
    } else {
      from = found;
    }
  }
  return out;
}

/**
 * Đoán phương pháp khi người dùng để "tự động": chọn phương pháp mà bước đầu
 * tiên hoàn thành sớm nhất theo tỷ lệ số nước.
 */
export function guessMethod(states: CubeState[]): MethodName {
  const n = Math.max(1, states.length - 1);
  const rouxFirst = detectStages(states, [ROUX_STAGES[0]])[0].endIndex;
  const cfopFirst = detectStages(states, [CFOP_STAGES[0]])[0].endIndex;
  if (rouxFirst < 0) return 'cfop';
  if (cfopFirst < 0) return 'roux';
  // Cross thường xong rất sớm ở CFOP; FB của Roux thường tốn nhiều nước hơn.
  return rouxFirst / n <= cfopFirst / n ? 'roux' : 'cfop';
}

/** Facelet của những miếng mà một bước chịu trách nhiệm — dùng để tô sáng khi xem lại. */
export function stepFacelets(key: string): number[] {
  switch (key) {
    case 'FB': return PIECES.FB;
    case 'SB': return PIECES.SB;
    case 'CMLL': return PIECES.U_CORNERS;
    case 'EO':
    case 'L4C': return PIECES.LSE_EDGES;
    case 'LR': return PIECES.UL_UR;
    case 'CROSS': return PIECES.CROSS;
    case 'F2L1': case 'F2L2': case 'F2L3': case 'F2L4': return F2L_SLOTS.flat();
    case 'OLL':
    case 'PLL': return [...Array.from({ length: 9 }, (_, i) => i), ...PIECES.U_CORNERS];
    default: return [];
  }
}
