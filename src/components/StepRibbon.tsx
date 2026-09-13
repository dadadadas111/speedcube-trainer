/**
 * The step time ribbon — the app's recurring motif.
 * It shows up wherever a solve does: right after the timer stops, in the solve
 * list, in the replay, and stacked up on the stats page.
 *
 * Each step's block is split in two: the pause before its first turn, drawn
 * muted, and the turning itself in full colour. A step that reads as slow
 * because you sat looking at it is a different problem from one that is slow
 * because your hands are, and the two should not look the same.
 *
 * Labelled, it reads as three rows over the same columns: the seconds above the
 * block they belong to, the block, and the step's name below it in the block's
 * own colour. Nothing has to be matched up against a legend, and nothing sits
 * in a wrapping row that reflows every time a solve changes shape. A column too
 * narrow for its text simply goes without — the numbers are all one tap away in
 * the detail sheet, and a squeezed "0.4" overlapping its neighbour helps no one.
 */

import { useState } from 'react';
import type { StepAnalysis } from '../analysis/solve';
import { shortStep, stepColor } from './palette';
import { formatSeconds } from '../analysis/stats';

interface Props {
  steps: StepAnalysis[];
  totalMs: number;
  height?: number;
  showLabels?: boolean;
  /** The selected step stays bright while the others dim */
  activeKey?: string | null;
  onSelect?: (key: string) => void;
}

/** Below this, calling it out is noise rather than information. */
const WORTH_MENTIONING_MS = 300;

/**
 * How much of the ribbon a column needs before its text fits.
 *
 * Two thresholds because the two rows hold different things: a time is always
 * four or five characters ("1.72", "12.40"), a short name is two to four ("FB",
 * "4b", "CMLL"). One threshold for both would either crop the times or throw
 * away names that had room. Measured at a phone's ~330px of ribbon: 8% is about
 * 26px, which is "1.72" at 11px, and 5% is about 16px, which is "FB".
 *
 * A column below the bar keeps its colour and its place; it just goes without
 * words. Everything about it is one tap away in the detail sheet.
 */
const TIME_MIN_PCT = 8;
const NAME_MIN_PCT = 5;

/** The step's own colour, drained of most of it. */
const recogColor = (key: string) => `color-mix(in srgb, ${stepColor(key)} 30%, var(--color-ink-800))`;

export default function StepRibbon({ steps, totalMs, height = 10, showLabels, activeKey, onSelect }: Props) {
  const total = totalMs || steps.reduce((a, s) => a + s.durationMs, 0) || 1;
  const [hover, setHover] = useState<string | null>(null);
  const shown = steps.find((s) => s.key === hover) ?? null;

  const columns = steps
    .map((s) => ({ step: s, pct: (s.durationMs / total) * 100 }))
    .filter((c) => c.pct > 0);

  const dim = (key: string) => (!activeKey || activeKey === key ? 1 : 0.25);
  const hoverProps = (key: string) => ({
    onMouseEnter: () => setHover(key),
    onMouseLeave: () => setHover((h) => (h === key ? null : h)),
  });

  return (
    <div className="w-full">
      {showLabels && (
        <div className="flex w-full">
          {columns.map(({ step, pct }) => (
            <span
              key={step.key}
              style={{ width: `${pct}%`, opacity: dim(step.key) }}
              className="tnum overflow-hidden text-center font-mono text-[11px] leading-tight whitespace-nowrap text-ink-300"
            >
              {pct >= TIME_MIN_PCT ? formatSeconds(step.durationMs) : ''}
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <div className={`flex w-full overflow-hidden rounded-[3px] ${showLabels ? 'my-1' : ''}`} style={{ height }}>
          {columns.map(({ step, pct }) => {
            const recogPct = step.durationMs > 0 ? Math.min(100, (step.leadMs / step.durationMs) * 100) : 0;
            const Tag = onSelect ? 'button' : 'div';
            return (
              <Tag
                key={step.key}
                {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(step.key) } : {})}
                {...hoverProps(step.key)}
                className="flex h-full border-0 p-0 transition-opacity"
                style={{
                  width: `${pct}%`,
                  background: stepColor(step.key),
                  opacity: dim(step.key),
                  cursor: onSelect ? 'pointer' : 'default',
                }}
                aria-label={`${step.label} ${formatSeconds(step.durationMs)} seconds`}
              >
                {recogPct > 0 && (
                  <span className="h-full" style={{ width: `${recogPct}%`, background: recogColor(step.key) }} />
                )}
              </Tag>
            );
          })}
        </div>
        {shown && <StepCard step={shown} total={total} />}
      </div>

      {showLabels && (
        <div className="flex w-full">
          {columns.map(({ step, pct }) => {
            const Tag = onSelect ? 'button' : 'div';
            return (
              <Tag
                key={step.key}
                {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(step.key) } : {})}
                {...hoverProps(step.key)}
                className="overflow-hidden border-0 bg-transparent p-0 text-center text-[11px] leading-tight font-semibold whitespace-nowrap"
                // The name carries the colour, so the swatch that used to sit
                // beside it is redundant — and on a phone it cost more width
                // than the name itself.
                style={{
                  width: `${pct}%`,
                  color: stepColor(step.key),
                  opacity: dim(step.key),
                  cursor: onSelect ? 'pointer' : 'default',
                }}
              >
                {pct >= NAME_MIN_PCT ? shortStep(step.key) : ''}
              </Tag>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Everything about one step, on hover.
 *
 * Recognition and execution are shown as a pair because they add up to the
 * total: the time spent looking at it, then the time spent turning it.
 *
 * Hover is a pointer's idea, so this never appears on a phone. The same numbers
 * live in StepDetail, which a tap or four turns of R will open.
 */
function StepCard({ step, total }: { step: StepAnalysis; total: number }) {
  const exec = Math.max(0, step.durationMs - step.leadMs);
  return (
    // Below the ribbon rather than above it: the ribbon usually sits at the top
    // of its panel, and a card above would be cut off by the panel's edge.
    <div className="panel pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-max -translate-x-1/2 px-3 py-2 shadow-lg sm:block">
      <div className="flex items-baseline gap-2">
        <span className="inline-block size-2 shrink-0 rounded-[2px]" style={{ background: stepColor(step.key) }} />
        <span className="text-[13px] font-semibold">{step.label}</span>
        {!step.detected && <span className="text-[11px] text-ink-500">not detected</span>}
      </div>
      <dl className="mt-1.5 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-[12px]">
        <Row label="total" value={`${formatSeconds(step.durationMs)}s`} />
        <Row label="share" value={`${Math.round((step.durationMs / total) * 100)}%`} />
        <Row label="turns" value={String(step.moveCount)} />
        <Row label="TPS" value={step.tps.toFixed(1)} />
        {step.leadMs >= WORTH_MENTIONING_MS && (
          <>
            <Row label="recognition" value={`${formatSeconds(step.leadMs)}s`} />
            <Row label="execution" value={`${formatSeconds(exec)}s`} />
          </>
        )}
        {step.pauses.length > 0 && (
          <Row label="pauses" value={`${step.pauses.length} · ${formatSeconds(step.pauseMs)}s`} />
        )}
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-ink-500">{label}</dt>
      <dd className="tnum text-right font-mono text-ink-100">{value}</dd>
    </>
  );
}

export { WORTH_MENTIONING_MS };
