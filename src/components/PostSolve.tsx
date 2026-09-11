/** The review panel shown right after each solve. */

import type { SolveAnalysis } from '../analysis/solve';
import { formatSeconds } from '../analysis/stats';
import { parMoves, reviewSolveOutcome, topRemarks, type ReviewFocus } from '../analysis/review';
import StepRibbon from './StepRibbon';
import { stepColor } from './palette';

const TONE = { good: 'text-good', warn: 'text-warn', bad: 'text-bad' };
const DOT = { good: 'var(--color-good)', warn: 'var(--color-warn)', bad: 'var(--color-bad)' };

export default function PostSolve({
  analysis,
  onOpenReplay,
  focus = 'speed',
}: {
  analysis: SolveAnalysis | null;
  onOpenReplay?: () => void;
  focus?: ReviewFocus;
}) {
  if (!analysis) {
    return (
      <p className="text-sm text-ink-400">
        Hand-timed, so there is no move data. Connect a smart cube to get the step breakdown.
      </p>
    );
  }
  const remarks = topRemarks(reviewSolveOutcome(analysis, focus));
  const refTotal = parMoves(analysis);

  return (
    <div className="pop-in">
      <StepRibbon steps={analysis.steps} totalMs={analysis.totalMs} height={14} showLabels />

      {/* Slow mode leads with the shape of the solution, speed mode with the clock */}
      <div className="mt-4 flex flex-wrap items-baseline justify-center gap-x-8 gap-y-2">
        {focus === 'slow' ? (
          <>
            <Figure
              value={String(analysis.totalMoves)}
              label="moves"
              note={
                refTotal > 0
                  ? `${analysis.totalMoves <= refTotal ? '' : '+'}${analysis.totalMoves - refTotal} vs par`
                  : undefined
              }
              tone={refTotal > 0 ? (analysis.totalMoves <= refTotal ? 'good' : 'warn') : undefined}
            />
            <Figure value={`${formatSeconds(analysis.totalMs)}s`} label="taken" />
          </>
        ) : (
          <>
            <Figure value={String(analysis.totalMoves)} label="moves" />
            <Figure value={analysis.tps.toFixed(1)} label="TPS" />
          </>
        )}
        <Figure value={`${Math.round(analysis.pauseRatio * 100)}%`} label="standing still" />
      </div>

      {onOpenReplay && (
        <div className="mt-3 flex justify-center">
          <button type="button" className="btn btn-ghost !px-2 !py-0.5 !text-[13px]" onClick={onOpenReplay}>
            Replay step by step
          </button>
        </div>
      )}

      {/* Several things about the whole solve, the good ones included */}
      <ul className="mt-3 flex flex-col gap-1.5">
        {remarks.map((r, i) => (
          <li key={i} className="flex items-baseline gap-2">
            <span
              className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full"
              style={{ background: r.key ? stepColor(r.key) : DOT[r.tone] }}
            />
            <span className={`max-w-[72ch] text-[13px] ${TONE[r.tone]}`}>{r.text}</span>
          </li>
        ))}
      </ul>

      {analysis.warning && <p className="mt-2 text-[13px] text-ink-400">{analysis.warning}</p>}
    </div>
  );
}

/** One headline number with its name under it. */
function Figure({
  value,
  label,
  note,
  tone,
}: {
  value: string;
  label: string;
  note?: string;
  tone?: 'good' | 'warn';
}) {
  return (
    <div className="text-center">
      <p className="tnum font-mono text-2xl font-semibold leading-none text-ink-100">{value}</p>
      <p className="mt-1 text-[12px] text-ink-500">{label}</p>
      {note && <p className={`text-[12px] ${tone === 'good' ? 'text-good' : 'text-warn'}`}>{note}</p>}
    </div>
  );
}

export { stepColor };
