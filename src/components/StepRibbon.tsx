/**
 * The step time ribbon — the app's recurring motif.
 * It shows up wherever a solve does: right after the timer stops, in the solve
 * list, in the replay, and stacked up on the stats page.
 *
 * Each step's block is split in two: the pause before its first turn, drawn
 * muted, and the turning itself in full colour. A step that reads as slow
 * because you sat looking at it is a different problem from one that is slow
 * because your hands are, and the two should not look the same.
 */

import type { StepAnalysis } from '../analysis/solve';
import { stepColor } from './palette';
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
  return (
    <div className="w-full">
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
              title={
                `${s.label}: ${formatSeconds(s.durationMs)}s · ${s.moveCount} moves · ${s.tps.toFixed(1)} TPS` +
                (s.leadMs >= WORTH_MENTIONING_MS ? ` · ${formatSeconds(s.leadMs)}s before the first turn` : '')
              }
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
      {showLabels && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
          {steps.map((s) => {
            const Tag = onSelect ? 'button' : 'div';
            return (
              <Tag
                key={s.key}
                {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(s.key) } : {})}
                className="flex items-baseline gap-1.5 border-0 bg-transparent p-0 text-left"
                style={{ cursor: onSelect ? 'pointer' : 'default', opacity: !activeKey || activeKey === s.key ? 1 : 0.4 }}
              >
                <span className="inline-block size-2 shrink-0 translate-y-px rounded-[2px]" style={{ background: stepColor(s.key) }} />
                <span className="text-[13px] text-ink-300">{s.label}</span>
                <span className="tnum font-mono text-[13px] text-ink-100">{formatSeconds(s.durationMs)}</span>
                <span className="tnum text-[11px] text-ink-500">{s.moveCount}n</span>
                {s.leadMs >= WORTH_MENTIONING_MS && (
                  <span
                    className="tnum text-[11px] text-ink-400"
                    title="Spent looking at the cube before the first turn of this step"
                  >
                    +{formatSeconds(s.leadMs)} rec
                  </span>
                )}
              </Tag>
            );
          })}
        </div>
      )}
    </div>
  );
}
