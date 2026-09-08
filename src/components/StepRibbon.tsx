/**
 * Dải phân bổ thời gian từng bước — motif chính của app.
 * Xuất hiện ở mọi nơi có một solve: ngay sau khi bấm giờ, trong danh sách,
 * trong replay, và xếp chồng ở trang thống kê.
 */

import type { StepAnalysis } from '../analysis/solve';
import { stepColor } from './palette';
import { formatSeconds } from '../analysis/stats';

interface Props {
  steps: StepAnalysis[];
  totalMs: number;
  height?: number;
  showLabels?: boolean;
  /** Bước đang được chọn sẽ sáng lên, các bước khác mờ đi */
  activeKey?: string | null;
  onSelect?: (key: string) => void;
}

export default function StepRibbon({ steps, totalMs, height = 10, showLabels, activeKey, onSelect }: Props) {
  const total = totalMs || steps.reduce((a, s) => a + s.durationMs, 0) || 1;
  return (
    <div className="w-full">
      <div className="flex w-full overflow-hidden rounded-[3px]" style={{ height }}>
        {steps.map((s) => {
          const pctW = (s.durationMs / total) * 100;
          if (pctW <= 0) return null;
          const active = !activeKey || activeKey === s.key;
          const Tag = onSelect ? 'button' : 'div';
          return (
            <Tag
              key={s.key}
              {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(s.key) } : {})}
              title={`${s.label}: ${formatSeconds(s.durationMs)}s · ${s.moveCount} nước · ${s.tps.toFixed(1)} TPS`}
              className="h-full border-0 p-0 transition-opacity"
              style={{
                width: `${pctW}%`,
                background: stepColor(s.key),
                opacity: active ? 1 : 0.25,
                cursor: onSelect ? 'pointer' : 'default',
              }}
              aria-label={`${s.label} ${formatSeconds(s.durationMs)} giây`}
            />
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
              <span className="tnum text-[11px] text-ink-400">{Math.round((s.durationMs / total) * 100)}%</span>
            </Tag>
          );})}
        </div>
      )}
    </div>
  );
}
