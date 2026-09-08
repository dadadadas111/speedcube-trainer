/**
 * Bộ gợi ý cải thiện: so tỷ trọng thời gian từng bước với hồ sơ tham chiếu,
 * rồi tách nguyên nhân thành nhận dạng/nhìn trước (dừng nhiều) hay
 * thực thi (TPS thấp) hay hiệu quả (nhiều nước).
 */

import type { SolveAnalysis } from './solve';
import type { MethodName } from './method';
import { meanOf, stdevOf } from './stats';

export interface StepProfile {
  /** Tỷ trọng thời gian mong đợi trong tổng solve */
  share: number;
  /** Số nước trung bình mong đợi (STM) */
  moves: number;
  /** Tỷ lệ dừng chấp nhận được */
  pauseRatio: number;
}

/** Hồ sơ tham chiếu cho người giải trình độ trung cấp (~20–30s). */
export const REFERENCE: Record<MethodName, Record<string, StepProfile>> = {
  roux: {
    FB: { share: 0.2, moves: 8, pauseRatio: 0.25 },
    SB: { share: 0.3, moves: 12, pauseRatio: 0.3 },
    CMLL: { share: 0.22, moves: 10, pauseRatio: 0.3 },
    EO: { share: 0.12, moves: 7, pauseRatio: 0.25 },
    LR: { share: 0.09, moves: 6, pauseRatio: 0.2 },
    L4C: { share: 0.07, moves: 5, pauseRatio: 0.15 },
  },
  cfop: {
    CROSS: { share: 0.12, moves: 7, pauseRatio: 0.2 },
    F2L1: { share: 0.12, moves: 7, pauseRatio: 0.3 },
    F2L2: { share: 0.12, moves: 7, pauseRatio: 0.3 },
    F2L3: { share: 0.13, moves: 7, pauseRatio: 0.3 },
    F2L4: { share: 0.13, moves: 7, pauseRatio: 0.3 },
    OLL: { share: 0.18, moves: 10, pauseRatio: 0.3 },
    PLL: { share: 0.2, moves: 13, pauseRatio: 0.25 },
  },
};

export interface StepAggregate {
  key: string;
  label: string;
  hint: string;
  meanMs: number;
  stdevMs: number;
  share: number;
  refShare: number;
  meanMoves: number;
  refMoves: number;
  tps: number;
  pauseRatio: number;
  refPauseRatio: number;
  /** Số giây mất thêm mỗi solve so với hồ sơ tham chiếu */
  excessMs: number;
  samples: number;
}

export interface Insight {
  severity: 'high' | 'medium' | 'low' | 'good';
  step: string;
  title: string;
  detail: string;
  action: string;
  /** Giá trị dùng để xếp hạng (giây mất thêm) */
  weight: number;
}

export function aggregateSteps(analyses: SolveAnalysis[]): StepAggregate[] {
  if (!analyses.length) return [];
  const method = analyses[0].method;
  const ref = REFERENCE[method];
  const byKey = new Map<string, SolveAnalysis['steps']>();
  for (const a of analyses) {
    if (a.method !== method) continue;
    for (const s of a.steps) {
      if (!s.detected) continue;
      if (!byKey.has(s.key)) byKey.set(s.key, []);
      byKey.get(s.key)!.push(s);
    }
  }
  const totalMean = meanOf(analyses.map((a) => a.totalMs));
  const out: StepAggregate[] = [];
  for (const [key, list] of byKey) {
    if (!list.length) continue;
    const meanMs = meanOf(list.map((s) => s.durationMs));
    const meanMoves = meanOf(list.map((s) => s.moveCount));
    const pauseRatio = meanOf(list.map((s) => (s.durationMs > 0 ? s.pauseMs / s.durationMs : 0)));
    const r = ref[key] ?? { share: 1 / byKey.size, moves: meanMoves, pauseRatio: 0.3 };
    out.push({
      key,
      label: list[0].label,
      hint: list[0].hint,
      meanMs,
      stdevMs: stdevOf(list.map((s) => s.durationMs)),
      share: totalMean > 0 ? meanMs / totalMean : 0,
      refShare: r.share,
      meanMoves,
      refMoves: r.moves,
      tps: meanMs > 0 ? (meanMoves / meanMs) * 1000 : 0,
      pauseRatio,
      refPauseRatio: r.pauseRatio,
      excessMs: totalMean * (meanMs / Math.max(1, totalMean) - r.share),
      samples: list.length,
    });
  }
  return out;
}

const secs = (ms: number) => (ms / 1000).toFixed(2) + 's';
const pct = (x: number) => Math.round(x * 100) + '%';

export function buildInsights(analyses: SolveAnalysis[]): Insight[] {
  const steps = aggregateSteps(analyses);
  if (!steps.length) return [];
  const insights: Insight[] = [];
  const totalMean = meanOf(analyses.map((a) => a.totalMs));

  for (const s of steps) {
    const overShare = s.share - s.refShare;
    const excessSec = overShare * totalMean;

    if (overShare > 0.04) {
      // Chẩn đoán nguyên nhân
      const pauseHeavy = s.pauseRatio > s.refPauseRatio + 0.08;
      const moveHeavy = s.meanMoves > s.refMoves * 1.25;
      const slowHands = s.tps < 3.2 && !pauseHeavy;
      let detail: string;
      let action: string;
      if (pauseHeavy) {
        detail = `Chiếm ${pct(s.share)} thời gian solve (tham chiếu ${pct(s.refShare)}). ${pct(s.pauseRatio)} thời gian của bước này là đứng yên nhìn khối — nghẽn ở khâu nhận dạng / nhìn trước chứ không phải tốc độ tay.`;
        action = s.key === 'CMLL' || s.key === 'OLL' || s.key === 'PLL'
          ? 'Vào mục Drill, luyện riêng các alg của bước này. Mục tiêu: nhận ra case dưới 0.5s.'
          : 'Tập solve chậm (slow solve): giải với 40% tốc độ nhưng KHÔNG được dừng. Ép mắt phải nhìn trước.';
      } else if (moveHeavy) {
        detail = `Chiếm ${pct(s.share)} thời gian và tốn trung bình ${s.meanMoves.toFixed(1)} nước (tham chiếu ~${s.refMoves}). Tay bạn không chậm, nhưng lời giải đang vòng vo.`;
        action = 'Xem lại replay các solve chậm, thử tìm lời giải ngắn hơn cho cùng tình huống. Tập tìm nhiều phương án trong lúc inspection.';
      } else if (slowHands) {
        detail = `Chiếm ${pct(s.share)} thời gian, TPS chỉ ${s.tps.toFixed(1)} mà lại ít dừng — vấn đề nằm ở tốc độ thực thi/finger trick.`;
        action = 'Luyện drill từng alg với mục tiêu TPS, chú ý regrip. Nếu là khối thì tập các cặp nước R U / M U cho mượt.';
      } else {
        detail = `Chiếm ${pct(s.share)} thời gian solve, cao hơn tham chiếu ${pct(s.refShare)}.`;
        action = 'Tách riêng bước này ra luyện: bấm giờ chỉ riêng bước này trên 20 lần.';
      }
      insights.push({
        severity: overShare > 0.09 ? 'high' : 'medium',
        step: s.label,
        title: `${s.label} đang là nút thắt lớn nhất (mất thêm ~${secs(excessSec)}/solve)`,
        detail,
        action,
        weight: excessSec,
      });
    }

  }

  // Chỉ nêu MỘT bước thiếu ổn định — cái nặng nhất. Nêu cả bốn thì thành nhiễu.
  const unstable = steps
    .filter((s) => s.samples >= 8 && s.stdevMs > s.meanMs * 0.55 && s.meanMs > 1500)
    .sort((a, b) => b.stdevMs - a.stdevMs)[0];
  if (unstable) {
    insights.push({
      severity: 'medium',
      step: unstable.label,
      title: `${unstable.label} là bước thiếu ổn định nhất`,
      detail: `Trung bình ${secs(unstable.meanMs)} nhưng độ lệch chuẩn tới ${secs(unstable.stdevMs)}. Nghĩa là bạn có vài case xử lý rất gọn và vài case bị khựng hẳn — vấn đề nằm ở case cụ thể chứ không phải cả bước.`,
      action: 'Vào danh sách solve, sắp theo thời gian rồi mở replay vài lần chậm nhất để tìm đúng case đang giết bạn.',
      weight: unstable.stdevMs * 0.5,
    });
  }

  // Nhận xét toàn cục
  const meanPauseRatio = meanOf(analyses.map((a) => a.pauseRatio));
  if (meanPauseRatio > 0.35) {
    insights.push({
      severity: 'high',
      step: 'Toàn bài',
      title: `${pct(meanPauseRatio)} thời gian solve là đứng yên`,
      detail: `Trung bình mỗi solve bạn dừng tay ${secs(meanPauseRatio * totalMean)}. Người giải cùng tốc độ thường chỉ dừng khoảng 20–30%.`,
      action: 'Ưu tiên số một: tập nhìn trước. Slow solve có kiểm soát hiệu quả hơn nhiều so với cố quay nhanh hơn.',
      weight: (meanPauseRatio - 0.28) * totalMean,
    });
  } else if (meanPauseRatio < 0.22) {
    insights.push({
      severity: 'good',
      step: 'Toàn bài',
      title: 'Nhìn trước tốt',
      detail: `Chỉ ${pct(meanPauseRatio)} thời gian là đứng yên — dòng chảy solve của bạn mượt.`,
      action: 'Giờ có thể đẩy TPS và học thêm alg mà không sợ hỏng nhịp.',
      weight: 0,
    });
  }

  const meanTps = meanOf(analyses.map((a) => a.tps));
  if (meanTps < 3 && meanPauseRatio < 0.3) {
    insights.push({
      severity: 'medium',
      step: 'Toàn bài',
      title: `TPS trung bình chỉ ${meanTps.toFixed(1)}`,
      detail: 'Bạn ít dừng nhưng tay chậm — giới hạn hiện tại là tốc độ thực thi.',
      action: 'Luyện drill alg theo mục tiêu TPS, và xem lại cách cầm/regrip trong replay.',
      weight: 500,
    });
  }

  const meanMoves = meanOf(analyses.map((a) => a.totalMoves));
  const moveBudget = analyses[0].method === 'roux' ? 50 : 58;
  if (meanMoves > moveBudget * 1.2) {
    insights.push({
      severity: 'medium',
      step: 'Toàn bài',
      title: `Trung bình ${meanMoves.toFixed(0)} nước/solve — hơi nhiều`,
      detail: `Người giải ${analyses[0].method === 'roux' ? 'Roux' : 'CFOP'} thường quanh ${moveBudget} nước. Mỗi nước thừa là ~0.2–0.3s.`,
      action: 'Tập trung vào hiệu quả lời giải hơn là tốc độ: giải chậm và cố tìm phương án ngắn hơn.',
      weight: (meanMoves - moveBudget) * 250,
    });
  }

  return insights.sort((a, b) => {
    if ((a.severity === 'good') !== (b.severity === 'good')) return a.severity === 'good' ? 1 : -1;
    return b.weight - a.weight;
  });
}
