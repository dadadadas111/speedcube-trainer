/**
 * Dẫn người dùng vặn scramble từ trạng thái đã giải.
 *
 * So khớp theo khoá bất biến-với-phép-quay, nên bạn cầm khối kiểu gì cũng được:
 * chỉ cần thực hiện đúng chuỗi nước theo ký hiệu trong hệ quy chiếu của chính
 * mình. Khoá này vẫn phân biệt màu, nên vặn nhầm mặt (ví dụ mặt cam thay vì mặt
 * đỏ) sẽ bị bắt lỗi ngay.
 *
 * Có ba trạng thái chứ không phải hai. Lý do: cube báo một nước 180 độ thành HAI
 * sự kiện quý riêng biệt, nên vặn U2 thì sau nửa đầu trạng thái khối chưa khớp
 * bước nào cả. Nếu chỉ có đúng/sai thì màn hình sẽ nháy đỏ giữa chừng mỗi lần
 * gặp U2 hay R2 — rất khó chịu. Vì vậy: đang vặn đúng mặt nhưng chưa đủ vòng thì
 * là "đang vặn dở" (vàng), chỉ khi đụng sang mặt khác mới tính là sai (đỏ).
 */

import { SOLVED_STATE, applyMove, canonicalKey, stateSequence, type CubeState } from '../cube/cube';
import { invertAlg, simplifyAlg, moveFace, moveAmount, makeMove } from '../cube/alg';

export type ScrambleStatus =
  /** Khối không ở trạng thái đã giải mà cũng không khớp bước nào — cần đồng bộ hoặc giải lại */
  | 'unknown'
  /** Đang ở đúng đường, chưa xong */
  | 'on-track'
  /** Đang vặn đúng mặt nhưng chưa tới đúng vòng (ví dụ mới vặn được nửa của U2) */
  | 'partial'
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
  /** Khi đang vặn dở: còn phải vặn thêm bao nhiêu nữa trên mặt đó */
  remaining: string | null;
  /** Chuỗi cần vặn để quay về đúng đường (chỉ có khi off-track) */
  fix: string[];
  /** Số nước đã vặn sai kể từ lúc lạc đường */
  wrongMoves: number;
}

export class ScrambleTracker {
  private keys: string[];
  /**
   * Với mỗi bước, các trạng thái "đang vặn dở" của đúng mặt đó: khoá -> phần
   * còn thiếu. Ví dụ bước U2 thì vặn U mới được một nửa, còn thiếu U.
   */
  private partials: Map<string, string>[];
  /** Các nước đã vặn kể từ điểm đúng gần nhất */
  private strayMoves: string[] = [];
  private done = 0;
  private lost = false;
  private partialRemaining: string | null = null;

  constructor(
    private scramble: string[],
    base: CubeState = SOLVED_STATE,
  ) {
    const states = stateSequence(base, scramble);
    this.keys = states.map(canonicalKey);
    this.partials = scramble.map((move, i) => {
      const face = moveFace(move);
      const want = moveAmount(move);
      const map = new Map<string, string>();
      for (let turned = 1; turned <= 3; turned++) {
        if (turned === want) continue; // đủ vòng rồi thì đã là bước kế tiếp
        const partial = makeMove(face, turned);
        const remaining = makeMove(face, want - turned);
        if (!partial || !remaining) continue;
        map.set(canonicalKey(applyMove(states[i], partial)), remaining);
      }
      return map;
    });
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
      this.partialRemaining = null;
      return this.snapshot();
    }

    // Đang vặn dở đúng mặt của bước hiện tại thì chưa phải là sai
    const remaining = this.partials[this.done]?.get(key);
    if (remaining) {
      this.partialRemaining = remaining;
      this.lost = false;
      this.strayMoves = move ? [...this.strayMoves, move] : this.strayMoves;
      return this.snapshot();
    }

    if (move) this.strayMoves.push(move);
    this.partialRemaining = null;
    this.lost = true;
    return this.snapshot();
  }

  /** Quên hết dấu vết cũ, coi như bắt đầu lại từ trạng thái hiện tại. */
  reset(state: CubeState): ScrambleProgress {
    this.done = 0;
    this.strayMoves = [];
    this.lost = false;
    this.partialRemaining = null;
    return this.update(state);
  }

  private snapshot(): ScrambleProgress {
    const base = {
      done: this.done,
      total: this.total,
      next: this.done < this.total ? this.scramble[this.done] : null,
      remaining: null as string | null,
      fix: [] as string[],
      wrongMoves: 0,
    };

    if (this.lost) {
      return {
        ...base,
        status: 'off-track',
        next: null,
        // Nếu biết đã vặn sai những gì thì chỉ cần vặn ngược lại. Không biết
        // (mất kết nối giữa chừng) thì hướng dẫn về trạng thái đã giải rồi làm lại.
        fix: this.strayMoves.length ? simplifyAlg(invertAlg(this.strayMoves)) : [],
        wrongMoves: this.strayMoves.length,
      };
    }
    if (this.partialRemaining) {
      return { ...base, status: 'partial', remaining: this.partialRemaining };
    }
    if (this.done >= this.total) {
      return { ...base, status: 'complete', next: null };
    }
    return { ...base, status: 'on-track' };
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
