/**
 * Dẫn người dùng vặn scramble từ trạng thái đã giải.
 *
 * So khớp theo khoá bất biến-với-phép-quay, nên bạn cầm khối kiểu gì cũng được:
 * chỉ cần thực hiện đúng chuỗi nước theo ký hiệu trong hệ quy chiếu của chính
 * mình. Khoá này vẫn phân biệt màu, nên vặn nhầm mặt (ví dụ mặt cam thay vì mặt
 * đỏ) sẽ bị bắt lỗi ngay.
 */

import { SOLVED_STATE, canonicalKey, stateSequence, type CubeState } from '../cube/cube';
import { invertAlg, simplifyAlg } from '../cube/alg';

export type ScrambleStatus =
  /** Khối không ở trạng thái đã giải mà cũng không khớp bước nào — cần đồng bộ hoặc giải lại */
  | 'unknown'
  /** Đang ở đúng đường, chưa xong */
  | 'on-track'
  /** Đã vặn xong toàn bộ scramble */
  | 'complete'
  /** Vặn sai, cần quay lại */
  | 'off-track';

export interface ScrambleProgress {
  status: ScrambleStatus;
  /** Số nước của scramble đã vặn đúng */
  done: number;
  total: number;
  /** Nước tiếp theo cần vặn, null nếu đã xong hoặc đang lạc */
  next: string | null;
  /** Chuỗi cần vặn để quay về đúng đường (chỉ có khi off-track) */
  fix: string[];
  /** Số nước đã vặn sai kể từ lúc lạc đường */
  wrongMoves: number;
}

export class ScrambleTracker {
  private keys: string[];
  /** Các nước đã vặn kể từ điểm đúng gần nhất */
  private strayMoves: string[] = [];
  private done = 0;
  private lost = false;

  constructor(private scramble: string[], base: CubeState = SOLVED_STATE) {
    this.keys = stateSequence(base, scramble).map(canonicalKey);
  }

  get total() {
    return this.scramble.length;
  }

  /**
   * Nạp trạng thái khối sau mỗi nước. `move` là nước vừa vặn (nếu biết) — dùng
   * để dựng gợi ý sửa. Gọi không kèm `move` khi chỉ đồng bộ lại trạng thái.
   */
  update(state: CubeState, move?: string): ScrambleProgress {
    const key = canonicalKey(state);

    // Ưu tiên bước ngay kế tiếp, rồi mới tìm rộng ra — tránh nhảy lung tung khi
    // scramble tình cờ có hai bước cho ra cùng một trạng thái.
    let found = -1;
    if (this.keys[this.done + 1] === key) found = this.done + 1;
    else if (this.keys[this.done] === key) found = this.done;
    else found = this.keys.indexOf(key);

    if (found >= 0) {
      this.done = found;
      this.strayMoves = [];
      this.lost = false;
      return this.snapshot();
    }

    if (move) this.strayMoves.push(move);
    this.lost = true;
    return this.snapshot();
  }

  /** Quên hết dấu vết cũ, coi như bắt đầu lại từ trạng thái hiện tại. */
  reset(state: CubeState): ScrambleProgress {
    this.done = 0;
    this.strayMoves = [];
    this.lost = false;
    return this.update(state);
  }

  private snapshot(): ScrambleProgress {
    if (this.lost) {
      return {
        status: 'off-track',
        done: this.done,
        total: this.total,
        next: null,
        // Nếu biết đã vặn sai những gì thì chỉ cần vặn ngược lại. Không biết
        // (mất kết nối giữa chừng) thì hướng dẫn về trạng thái đã giải rồi làm lại.
        fix: this.strayMoves.length ? simplifyAlg(invertAlg(this.strayMoves)) : [],
        wrongMoves: this.strayMoves.length,
      };
    }
    const complete = this.done >= this.total;
    return {
      status: complete ? 'complete' : this.done === 0 ? 'on-track' : 'on-track',
      done: this.done,
      total: this.total,
      next: complete ? null : this.scramble[this.done],
      fix: [],
      wrongMoves: 0,
    };
  }

  /** Trạng thái hiện tại mà không nạp gì thêm. */
  peek(): ScrambleProgress {
    return this.snapshot();
  }
}

/**
 * Khối có đang ở trạng thái đã giải (không quan tâm cầm hướng nào) không.
 * Dùng để biết đã sẵn sàng bắt đầu vặn scramble chưa.
 */
export function isAtStart(state: CubeState, base: CubeState = SOLVED_STATE): boolean {
  return canonicalKey(state) === canonicalKey(base);
}
