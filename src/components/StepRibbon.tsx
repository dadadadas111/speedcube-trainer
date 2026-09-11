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
 * The row underneath carries only the short name and the time, because that is
 * what gets read at a glance — "FB 1.72  SB 2.65" is a shape you recognise. The
 * rest is one hover away.
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

/** The step's own colour, drained of most of it. */
const recogColor = (key: string) => `color-mix(in srgb, ${stepColor(key)} 30%, var(--color-ink-800))`;

export default function StepRibbon({ steps, totalMs, height = 10, showLabels, activeKey, onSelect }: Props) {
  const total = totalMs || steps.reduce((a, s) => a + s.durationMs, 0) || 1;
  const [hover, setHover] = useState<string | null>(null);
  const shown = steps.find((s) => s.key === hover) ?? null;

  return (
    <div className="w-full">
      <div className="relative">
        <div className="flex w-full overflow-hidden rounded-[3px]" style={{ height }}>
          {steps.map((s) => {
            const pctW = (s.durationMs / total) * 100;
            if (pctW <= 0) return null;
            const active = !activeKey || activeKey === s.key;
            const recogPct = s.durationMs > 0 ? Math.min(100, (s.leadMs / s.durationMs) * 100) : 0;
            const Tag = onSelect ? 'button' : 'div';
            return (
              <Tag
                key={s.key}
                {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(s.key) } : {})}
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover((h) => (h === s.key ? null : h))}
                className="flex h-full border-0 p-0 transition-opacity"
                style={{
                  width: `${pctW}%`,
                  background: stepColor(s.key),
                  opacity: active ? 1 : 0.25,
                  cursor: onSelect ? 'pointer' : 'default',
                }}
                aria-label={`${s.label} ${formatSeconds(s.durationMs)} seconds`}
              >
                {recogPct > 0 && (
                  <span className="h-full" style={{ width: `${recogPct}%`, background: recogColor(s.key) }} />
                )}
              </Tag>
            );
          })}
        </div>
        {shown && <StepCard step={shown} total={total} />}
      </div>

      {showLabels && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {steps.map((s) => {
            const Tag = onSelect ? 'button' : 'div';
            return (
              <Tag
                key={s.key}
                {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(s.key) } : {})}
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover((h) => (h === s.key ? null : h))}
                className="flex items-baseline gap-1.5 border-0 bg-transparent p-0 text-left"
                style={{ cursor: onSelect ? 'pointer' : 'default', opacity: !activeKey || activeKey === s.key ? 1 : 0.4 }}
              >
                <span className="inline-block size-2 shrink-0 translate-y-px rounded-[2px]" style={{ background: stepColor(s.key) }} />
                <span className="text-[13px] text-ink-400">{shortStep(s.key)}</span>
                <span className="tnum font-mono text-[13px] text-ink-100">{formatSeconds(s.durationMs)}</span>
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
 */
function StepCard({ step, total }: { step: StepAnalysis; total: number }) {
  const exec = Math.max(0, step.durationMs - step.leadMs);
  return (
    // Below the ribbon rather than above it: the ribbon usually sits at the top
    // of its panel, and a card above would be cut off by the panel's edge.
    <div className="panel pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-max -translate-x-1/2 px-3 py-2 shadow-lg">
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
