/**
 * Máy so khớp cho chế độ drill alg.
 *
 * So khớp theo TRẠNG THÁI chứ không theo tên nước. Lý do: cảm biến báo nước rộng
 * r thành L, báo M thành hai sự kiện R + L', và không thấy các phép xoay khối.
 * So sánh trạng thái theo khoá bất biến-với-phép-quay nên mọi cách thực hiện
 * tương đương đều được chấp nhận.
 */

import { canonicalKey, applyMoves, stateSequence, type CubeState } from '../cube/cube';
import { invertAlg } from '../cube/alg';

export type DrillEvent = 'progress' | 'complete' | 'off-track' | 'back';

export interface DrillProgress {
  event: DrillEvent;
  /** Đã khớp tới nước thứ mấy (0 = mới ở trạng thái case) */
  index: number;
  /** Thời điểm khớp từng nước, tính từ nước đầu tiên (ms) */
  moveTimes: (number | null)[];
}

/** Trạng thái case = áp dụng nghịch đảo của alg lên khối đã giải. */
export function caseStateFor(alg: string[], base: CubeState): CubeState {
  return applyMoves(base, invertAlg(alg));
}

export class DrillMatcher {
  private expectedKeys: string[];
  private matchedAt: (number | null)[];
  private index = 0;
  private t0: number | null = null;
  /** Số nước liên tiếp hiện đang lệch khỏi alg */
  private offTrackRun = 0;
  /** Lỗi thật sự (đã loại trừ trường hợp nước M bị cảm biến tách làm đôi) */
  mistakes = 0;
  /** Tổng số nước lệch, kể cả nửa nước lát cắt */
  extraMoves = 0;

  constructor(
    private alg: string[],
    caseState: CubeState,
  ) {
    this.expectedKeys = stateSequence(caseState, alg).map(canonicalKey);
    this.matchedAt = new Array(alg.length + 1).fill(null);
    this.matchedAt[0] = 0;
  }

  get length() {
    return this.alg.length;
  }
  get done() {
    return this.index >= this.alg.length;
  }
  get startedAt() {
    return this.t0;
  }

  /** Nạp trạng thái khối sau mỗi nước. `t` là mốc thời gian tuyệt đối (ms). */
  feed(state: CubeState, t: number): DrillProgress {
    const key = canonicalKey(state);
    // Ưu tiên khớp tiến để tránh nhầm khi alg có trạng thái lặp
    let found = -1;
    for (let i = this.index + 1; i < this.expectedKeys.length; i++) {
      if (this.expectedKeys[i] === key) {
        found = i;
        break;
      }
    }
    if (found < 0) {
      for (let i = 0; i <= this.index; i++) {
        if (this.expectedKeys[i] === key) {
          found = i;
          break;
        }
      }
      if (found >= 0 && found < this.index) {
        this.index = found;
        this.offTrackRun = 0;
        return { event: 'back', index: found, moveTimes: this.moveTimes() };
      }
      this.extraMoves++;
      this.offTrackRun++;
      // Một nước lệch đơn lẻ thường chỉ là nửa nước lát cắt (cảm biến báo M
      // thành R rồi L'), chỉ tính là lỗi khi lệch từ hai nước trở lên.
      if (this.offTrackRun === 2) this.mistakes++;
      return { event: 'off-track', index: this.index, moveTimes: this.moveTimes() };
    }
    this.offTrackRun = 0;
    if (this.t0 === null) this.t0 = t;
    for (let i = this.index + 1; i <= found; i++) this.matchedAt[i] = t - this.t0;
    this.index = found;
    return {
      event: this.done ? 'complete' : 'progress',
      index: found,
      moveTimes: this.moveTimes(),
    };
  }

  private moveTimes(): (number | null)[] {
    return this.matchedAt.slice(1);
  }
}

/* ---------- Tổng hợp nhiều lần drill ---------- */

export interface DrillRepData {
  date: number;
  recognitionMs: number;
  execMs: number;
  /** Thời điểm hoàn thành từng nước, tính từ nước đầu (ms) */
  moveTimes: (number | null)[];
  extraMoves: number;
  success: boolean;
}

export interface MoveStat {
  index: number;
  move: string;
  /** Trung vị khoảng thời gian từ nước trước sang nước này (ms) */
  medianMs: number;
  p25Ms: number;
  p75Ms: number;
  bestMs: number;
  samples: number;
  /** medianMs chia cho trung vị chung của alg — >1.6 là điểm khựng rõ rệt */
  hesitation: number;
}

export interface DrillSummary {
  reps: number;
  successRate: number;
  bestExecMs: number;
  medianExecMs: number;
  recentExecMs: number;
  medianRecognitionMs: number;
  tps: number;
  moveStats: MoveStat[];
  /** Chỉ số các nước đáng luyện lại nhất */
  worstMoves: MoveStat[];
  trend: { date: number; execMs: number }[];
}

function med(xs: number[]): number {
  if (!xs.length) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function quant(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  const i = (a.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (i - lo);
}

export function summarizeDrill(alg: string[], reps: DrillRepData[]): DrillSummary {
  const ok = reps.filter((r) => r.success);
  const deltasByIndex: number[][] = alg.map(() => []);
  for (const r of ok) {
    let prev = 0;
    for (let i = 0; i < alg.length; i++) {
      const t = r.moveTimes[i];
      if (t == null) {
        prev = NaN;
        continue;
      }
      if (!isNaN(prev)) deltasByIndex[i].push(t - prev);
      prev = t;
    }
  }
  const allDeltas = deltasByIndex.flat().filter((d) => d >= 0);
  const overallMed = med(allDeltas) || 1;

  const moveStats: MoveStat[] = alg.map((move, i) => {
    const ds = deltasByIndex[i].filter((d) => d >= 0);
    const m = med(ds);
    return {
      index: i,
      move,
      medianMs: m,
      p25Ms: quant(ds, 0.25),
      p75Ms: quant(ds, 0.75),
      bestMs: ds.length ? Math.min(...ds) : NaN,
      samples: ds.length,
      hesitation: isNaN(m) ? 0 : m / overallMed,
    };
  });

  const execs = ok.map((r) => r.execMs);
  const recent = ok.slice(-5).map((r) => r.execMs);
  const medianExec = med(execs);

  return {
    reps: reps.length,
    successRate: reps.length ? ok.length / reps.length : 0,
    bestExecMs: execs.length ? Math.min(...execs) : NaN,
    medianExecMs: medianExec,
    recentExecMs: med(recent),
    medianRecognitionMs: med(ok.map((r) => r.recognitionMs).filter((x) => x > 0)),
    tps: medianExec > 0 ? (alg.length / medianExec) * 1000 : 0,
    moveStats,
    worstMoves: [...moveStats]
      .filter((s) => s.index > 0 && s.samples >= 2 && s.hesitation > 1.5)
      .sort((a, b) => b.medianMs - a.medianMs)
      .slice(0, 3),
    trend: ok.map((r) => ({ date: r.date, execMs: r.execMs })),
  };
}
