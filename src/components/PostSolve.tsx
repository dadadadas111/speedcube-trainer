/** The review panel shown right after each solve. */

import { stepOfPause, type SolveAnalysis } from '../analysis/solve';
import { REFERENCE } from '../analysis/recommend';
import { formatSeconds } from '../analysis/stats';
import StepRibbon from './StepRibbon';
import { stepColor } from './palette';

/** One line of comment on the solve just finished. */
function verdict(a: SolveAnalysis): { text: string; tone: 'good' | 'warn' | 'bad' } {
  const ref = REFERENCE[a.method];
  const detected = a.steps.filter((s) => s.detected && s.durationMs > 0);
  if (!detected.length) return { text: 'Could not split this solve into steps.', tone: 'warn' };

  const worst = detected
    .map((s) => ({ s, over: s.durationMs / a.totalMs - (ref[s.key]?.share ?? 0) }))
    .sort((x, y) => y.over - x.over)[0];

  const longest = a.longestPause;
  if (longest && longest.ms > 1200) {
    const step = stepOfPause(a.steps, longest.moveIndex);
    return {
      text: `Stuck for ${formatSeconds(longest.ms)}s during ${step?.label ?? 'the solve'} — the longest pause this time.`,
      tone: 'bad',
    };
  }
  if (worst.over > 0.08) {
    return {
      text: `${worst.s.label} ate ${Math.round((worst.s.durationMs / a.totalMs) * 100)}% of the solve, more than usual.`,
      tone: 'warn',
    };
  }
  if (a.pauseRatio < 0.22) {
    return { text: `Smooth — only ${Math.round(a.pauseRatio * 100)}% of the time spent still.`, tone: 'good' };
  }
  return {
    text: `${Math.round(a.pauseRatio * 100)}% of the time standing still, ${a.totalMoves} moves, ${a.tps.toFixed(1)} TPS.`,
    tone: 'warn',
  };
}

const TONE = { good: 'text-good', warn: 'text-warn', bad: 'text-bad' };

export default function PostSolve({ analysis, onOpenReplay }: { analysis: SolveAnalysis | null; onOpenReplay?: () => void }) {
  if (!analysis) {
    return (
      <p className="text-sm text-ink-400">
        Hand-timed, so there is no move data. Connect a smart cube to get the step breakdown.
      </p>
    );
  }
  const v = verdict(analysis);
  return (
    <div className="pop-in">
      <StepRibbon steps={analysis.steps} totalMs={analysis.totalMs} height={14} showLabels />
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-ink-300">
        <span>
          <span className="tnum font-mono text-ink-100">{analysis.totalMoves}</span> moves
        </span>
        <span>
          <span className="tnum font-mono text-ink-100">{analysis.tps.toFixed(1)}</span> TPS
        </span>
        <span>
          <span className="tnum font-mono text-ink-100">{Math.round(analysis.pauseRatio * 100)}%</span> standing still
        </span>
        {onOpenReplay && (
          <button type="button" className="btn btn-ghost !px-2 !py-0.5 !text-[13px]" onClick={onOpenReplay}>
            Replay step by step
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
