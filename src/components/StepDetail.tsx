/**
 * Every step's numbers at once, for a screen with no pointer.
 *
 * On a laptop the ribbon gives this up one step at a time on hover. A phone has
 * no hover, and a solve has five or six steps, so tapping each in turn to read
 * a tooltip would be worse than useless — you would lose the comparison, which
 * is the only reason to look. So this lays them all out in one column with the
 * same shape repeated, and the eye does the comparing.
 *
 * It opens over the cube, which is the one thing on screen that has already
 * done its job by the time a solve is finished.
 */

import type { StepAnalysis } from '../analysis/solve';
import { formatSeconds } from '../analysis/stats';
import { shortStep, stepColor } from './palette';

/** Below this, recognition time is not worth separating out. */
const WORTH_MENTIONING_MS = 300;

export default function StepDetail({
  steps,
  totalMs,
  onClose,
}: {
  steps: StepAnalysis[];
  totalMs: number;
  onClose: () => void;
}) {
  const total = totalMs || steps.reduce((a, s) => a + s.durationMs, 0) || 1;
  return (
    <div className="pop-in absolute inset-0 z-20 flex flex-col rounded-[inherit] bg-ink-900/95 backdrop-blur-sm">
      <div className="flex items-baseline justify-between px-4 pt-2.5 pb-1.5">
        <h3 className="text-[13px] font-semibold text-ink-200">Step by step</h3>
        <button
          type="button"
          className="btn btn-ghost !px-2 !py-0.5 !text-[12px]"
          onClick={onClose}
          aria-label="Close the step detail"
        >
          close
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="flex flex-col gap-2">
          {steps
            .filter((s) => s.durationMs > 0)
            .map((s) => (
              <StepLine key={s.key} step={s} total={total} />
            ))}
        </div>
      </div>
    </div>
  );
}

/**
 * One step: its name and time on the left, everything else in a tight grid.
 *
 * Recognition and execution sit together because they add up to the total — the
 * time spent looking at the case, then the time spent turning it — and knowing
 * which half is the slow one is the whole point of splitting them.
 */
function StepLine({ step, total }: { step: StepAnalysis; total: number }) {
  const exec = Math.max(0, step.durationMs - step.leadMs);
  const share = Math.round((step.durationMs / total) * 100);
  const colour = stepColor(step.key);
  return (
    <div className="border-l-2 pl-2.5" style={{ borderColor: colour }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold" style={{ color: colour }}>
          {shortStep(step.key)}
          {!step.detected && <span className="ml-1.5 text-[10px] font-normal text-ink-500">not detected</span>}
        </span>
        <span className="tnum font-mono text-[15px] text-ink-100">{formatSeconds(step.durationMs)}s</span>
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0 text-[11px] text-ink-500">
        <Pair label="share" value={`${share}%`} />
        <Pair label="turns" value={String(step.moveCount)} />
        <Pair label="TPS" value={step.tps.toFixed(1)} />
        {step.leadMs >= WORTH_MENTIONING_MS && (
          <>
            <Pair label="recog" value={`${formatSeconds(step.leadMs)}s`} />
            <Pair label="exec" value={`${formatSeconds(exec)}s`} />
          </>
        )}
        {step.pauses.length > 0 && (
          <Pair label="pauses" value={`${step.pauses.length} · ${formatSeconds(step.pauseMs)}s`} />
        )}
      </div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <span className="whitespace-nowrap">
      {label} <span className="tnum font-mono text-ink-200">{value}</span>
    </span>
  );
}
