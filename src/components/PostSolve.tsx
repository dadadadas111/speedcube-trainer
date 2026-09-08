/** Bảng đánh giá hiện ngay sau mỗi solve. */

import type { SolveAnalysis } from '../analysis/solve';
import { REFERENCE } from '../analysis/recommend';
import { formatSeconds } from '../analysis/stats';
import StepRibbon from './StepRibbon';
import { stepColor } from './palette';

/** Một câu nhận xét cho riêng solve vừa xong. */
function verdict(a: SolveAnalysis): { text: string; tone: 'good' | 'warn' | 'bad' } {
  const ref = REFERENCE[a.method];
  const detected = a.steps.filter((s) => s.detected && s.durationMs > 0);
  if (!detected.length) return { text: 'Không tách được các bước từ solve này.', tone: 'warn' };

  const worst = detected
    .map((s) => ({ s, over: s.durationMs / a.totalMs - (ref[s.key]?.share ?? 0) }))
    .sort((x, y) => y.over - x.over)[0];

  const longest = a.longestPause;
  if (longest && longest.ms > 1200) {
    const step = a.steps.find((s) => longest.moveIndex > s.startIndex && longest.moveIndex <= s.endIndex);
    return {
      text: `Đứng hình ${formatSeconds(longest.ms)}s ở ${step?.label ?? 'giữa solve'} — dài nhất trong lần này.`,
      tone: 'bad',
    };
  }
  if (worst.over > 0.08) {
    return {
      text: `${worst.s.label} ngốn ${Math.round((worst.s.durationMs / a.totalMs) * 100)}% thời gian, cao hơn mức thường thấy.`,
      tone: 'warn',
    };
  }
  if (a.pauseRatio < 0.22) {
    return { text: `Mượt — chỉ ${Math.round(a.pauseRatio * 100)}% thời gian là đứng yên.`, tone: 'good' };
  }
  return {
    text: `${Math.round(a.pauseRatio * 100)}% thời gian đứng yên, ${a.totalMoves} nước, ${a.tps.toFixed(1)} TPS.`,
    tone: 'warn',
  };
}

const TONE = { good: 'text-good', warn: 'text-warn', bad: 'text-bad' };

export default function PostSolve({ analysis, onOpenReplay }: { analysis: SolveAnalysis | null; onOpenReplay?: () => void }) {
  if (!analysis) {
    return (
      <p className="text-sm text-ink-400">
        Bấm giờ tay nên không có dữ liệu từng nước. Kết nối smart cube để xem phân tích từng bước.
      </p>
    );
  }
  const v = verdict(analysis);
  return (
    <div className="pop-in">
      <StepRibbon steps={analysis.steps} totalMs={analysis.totalMs} height={14} showLabels />
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-ink-300">
        <span>
          <span className="tnum font-mono text-ink-100">{analysis.totalMoves}</span> nước
        </span>
        <span>
          <span className="tnum font-mono text-ink-100">{analysis.tps.toFixed(1)}</span> TPS
        </span>
        <span>
          đứng yên <span className="tnum font-mono text-ink-100">{Math.round(analysis.pauseRatio * 100)}%</span>
        </span>
        {onOpenReplay && (
          <button type="button" className="btn btn-ghost !px-2 !py-0.5 !text-[13px]" onClick={onOpenReplay}>
            Xem lại từng bước
          </button>
        )}
      </div>
      <p className={`mt-2 text-sm ${TONE[v.tone]}`}>{v.text}</p>
      {analysis.warning && <p className="mt-1.5 text-[13px] text-ink-400">{analysis.warning}</p>}
    </div>
  );
}

export { verdict };
export { stepColor };
