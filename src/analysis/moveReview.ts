/**
 * Chấm điểm từng nước trong một solve, kiểu xem lại ván cờ — nhưng thang đo là
 * NHANH/CHẬM chứ không phải hay/dở. App không biết nước nào là lựa chọn tốt,
 * nhưng biết rất rõ nước nào chậm hơn tốc độ thường ngày của chính bạn.
 *
 * Mốc so sánh lấy từ lịch sử của chính bạn, theo ba tầng dự phòng:
 *   1. Đúng cặp nước đó (ví dụ "R' -> U2") — sát nhất, cần đủ mẫu.
 *   2. Cặp mặt (ví dụ "R -> U") — thưa hơn nên gom nhiều mẫu hơn.
 *   3. Bước đang làm (FB, SB, CMLL...) rồi cuối cùng là toàn bộ lịch sử.
 *
 * Nhờ vậy "chậm" nghĩa là chậm so với chính bạn ở đúng tình huống đó, chứ không
 * phải so với một con số chung chung.
 */

import type { SolveAnalysis, StepAnalysis } from './solve';
import { moveFace } from '../cube/alg';

/** Dưới mức này thì mẫu quá ít, không đủ tin để làm mốc riêng. */
const MIN_TRANSITION_SAMPLES = 6;
const MIN_FACE_SAMPLES = 10;
const MIN_STEP_SAMPLES = 12;
/** Khoảng cách vô lý (rớt bluetooth, đặt khối xuống) thì không tính vào mốc. */
const MAX_SANE_GAP_MS = 6000;

export type MoveVerdict = 'rất nhanh' | 'nhanh' | 'bình thường' | 'chậm' | 'đứng hình';

export interface MoveBaseline {
  transition: Map<string, number>;
  facePair: Map<string, number>;
  step: Map<string, number>;
  overall: number;
  /** Tổng số khoảng cách giữa hai nước đã dùng để dựng mốc */
  samples: number;
  /** Số solve đã góp vào */
  solves: number;
}

export interface MoveRating {
  index: number;
  move: string;
  prevMove: string | null;
  deltaMs: number;
  baselineMs: number;
  /** deltaMs / baselineMs — 1 là đúng bằng tốc độ thường ngày */
  ratio: number;
  verdict: MoveVerdict;
  /** Số ms mất thêm so với mốc; chỉ tính cho nước bị coi là chậm */
  lostMs: number;
  basis: 'cặp nước' | 'cặp mặt' | 'bước' | 'toàn bộ';
  stepKey: string;
  stepLabel: string;
}

export interface SolveReview {
  ratings: MoveRating[];
  /** Tổng thời gian mất thêm ở những nước chậm bất thường */
  lostMs: number;
  /** Thời gian solve nếu các nước chậm đó chạy bằng tốc độ thường ngày */
  potentialMs: number;
  slowest: MoveRating[];
  fastest: MoveRating[];
  /** Mốc dựng từ bao nhiêu solve — ít quá thì đánh giá chưa đáng tin */
  baselineSolves: number;
  reliable: boolean;
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function push(map: Map<string, number[]>, key: string, value: number) {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

function medianMap(map: Map<string, number[]>, minSamples: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, v] of map) if (v.length >= minSamples) out.set(k, median(v));
  return out;
}

function stepAt(a: SolveAnalysis, moveIndex: number): StepAnalysis | undefined {
  return a.steps.find((s) => moveIndex > s.startIndex && moveIndex <= s.endIndex);
}

export function buildMoveBaseline(analyses: SolveAnalysis[]): MoveBaseline {
  const transition = new Map<string, number[]>();
  const facePair = new Map<string, number[]>();
  const step = new Map<string, number[]>();
  const all: number[] = [];

  for (const a of analyses) {
    for (let i = 1; i < a.moves.length; i++) {
      const delta = a.moves[i].t - a.moves[i - 1].t;
      if (delta <= 0 || delta > MAX_SANE_GAP_MS) continue;
      const prev = a.moves[i - 1].move;
      const cur = a.moves[i].move;
      push(transition, prev + '>' + cur, delta);
      push(facePair, moveFace(prev) + '>' + moveFace(cur), delta);
      const s = stepAt(a, i);
      if (s) push(step, s.key, delta);
      all.push(delta);
    }
  }

  return {
    transition: medianMap(transition, MIN_TRANSITION_SAMPLES),
    facePair: medianMap(facePair, MIN_FACE_SAMPLES),
    step: medianMap(step, MIN_STEP_SAMPLES),
    overall: all.length ? median(all) : NaN,
    samples: all.length,
    solves: analyses.length,
  };
}

function verdictFor(ratio: number): MoveVerdict {
  if (ratio < 0.65) return 'rất nhanh';
  if (ratio < 0.9) return 'nhanh';
  if (ratio < 1.5) return 'bình thường';
  if (ratio < 2.5) return 'chậm';
  return 'đứng hình';
}

/** Từ mức này trở lên mới tính là mất thời gian, dưới nữa chỉ là dao động thường. */
const LOST_FROM_RATIO = 1.5;

export function reviewSolve(analysis: SolveAnalysis, baseline: MoveBaseline): SolveReview {
  // Chưa có lịch sử thì lấy tạm chính solve này làm mốc, để vẫn chỉ ra được
  // nước nào lệch so với phần còn lại của bài.
  const fallback = isFinite(baseline.overall)
    ? baseline.overall
    : median(analysis.moves.slice(1).map((m, i) => m.t - analysis.moves[i].t).filter((d) => d > 0));

  const ratings: MoveRating[] = [];
  for (let i = 1; i < analysis.moves.length; i++) {
    const prev = analysis.moves[i - 1].move;
    const cur = analysis.moves[i].move;
    const delta = analysis.moves[i].t - analysis.moves[i - 1].t;
    const step = stepAt(analysis, i);

    let baseMs = baseline.transition.get(prev + '>' + cur);
    let basis: MoveRating['basis'] = 'cặp nước';
    if (baseMs === undefined) {
      baseMs = baseline.facePair.get(moveFace(prev) + '>' + moveFace(cur));
      basis = 'cặp mặt';
    }
    if (baseMs === undefined && step) {
      baseMs = baseline.step.get(step.key);
      basis = 'bước';
    }
    if (baseMs === undefined) {
      baseMs = fallback;
      basis = 'toàn bộ';
    }
    if (!isFinite(baseMs) || baseMs <= 0) baseMs = Math.max(1, fallback || 1);

    const ratio = delta / baseMs;
    ratings.push({
      index: i,
      move: cur,
      prevMove: prev,
      deltaMs: delta,
      baselineMs: baseMs,
      ratio,
      verdict: verdictFor(ratio),
      lostMs: ratio >= LOST_FROM_RATIO ? delta - baseMs : 0,
      basis,
      stepKey: step?.key ?? '',
      stepLabel: step?.label ?? '',
    });
  }

  const lostMs = ratings.reduce((sum, r) => sum + r.lostMs, 0);
  const byRatio = [...ratings].sort((a, b) => b.ratio - a.ratio);

  return {
    ratings,
    lostMs,
    potentialMs: Math.max(0, analysis.totalMs - lostMs),
    slowest: byRatio.filter((r) => r.lostMs > 0).slice(0, 5),
    fastest: byRatio.slice(-3).reverse().filter((r) => r.ratio < 0.9),
    baselineSolves: baseline.solves,
    reliable: baseline.solves >= 10 && baseline.samples >= 300,
  };
}

export const VERDICT_COLORS: Record<MoveVerdict, string> = {
  'rất nhanh': '#17b26a',
  nhanh: '#5fc48f',
  'bình thường': '#5d6d80',
  chậm: '#ffcf2e',
  'đứng hình': '#e0384f',
};
