/**
 * The overlay, in pieces.
 *
 * One Browser Source per block, because that is where a streamer already does
 * this work: OBS has the drag handles, the snapping and the scene switching,
 * and it does them better than anything built here would. An editor in the app
 * that laid the blocks out itself would be a worse OBS inside a worse window.
 * So the app's job is to say what each block looks like and hand over an
 * address; where it goes on screen is OBS's business.
 *
 * Every block reads the same published state and shows a different part of it,
 * so nothing has to be sent twice and a block costs nothing until it is used.
 */

import type { ReactNode } from 'react';
import type { StreamState } from './protocol';
import { formatTime, formatSeconds } from '../analysis/stats';
import { stepColor, shortStep } from '../components/palette';

export type WidgetId = 'clock' | 'solves' | 'scramble' | 'ribbon' | 'goal' | 'stats' | 'all';

export interface WidgetProps {
  state: StreamState;
  /** Running clock, counted by the overlay itself */
  shownMs: number;
  /** How many rows a list block shows */
  rows: number;
}

const SHADOW = '0 0.06em 0.18em rgba(0,0,0,0.85)';
const MUTED = '#9fb0c2';

/* ---------------- the blocks ---------------- */

function Clock({ state, shownMs }: WidgetProps) {
  const text =
    state.phase === 'inspecting'
      ? (state.inspectLeftMs / 1000).toFixed(1)
      : state.phase === 'running'
        ? formatTime(shownMs)
        : state.penalty === 'DNF'
          ? 'DNF'
          : state.finalMs != null
            ? formatTime(state.finalMs)
            : '—';
  const colour =
    state.phase === 'inspecting'
      ? 'var(--color-warn)'
      : state.phase === 'running'
        ? '#fff'
        : state.finalMs != null && state.finalMs <= state.goalMs
          ? 'var(--color-good)'
          : '#fff';
  return (
    <span
      className="tnum font-mono leading-none font-semibold"
      style={{ fontSize: '3.4em', color: colour, textShadow: SHADOW }}
    >
      {text}
      {state.penalty === '+2' && <span style={{ color: 'var(--color-bad)' }}>+2</span>}
    </span>
  );
}

function Stats({ state }: WidgetProps) {
  return (
    <div
      className="flex flex-wrap items-baseline gap-x-[0.9em] gap-y-[0.2em] font-mono"
      style={{ textShadow: SHADOW }}
    >
      <Pair label="ao5" value={formatTime(state.ao5)} />
      <Pair label="ao12" value={formatTime(state.ao12)} />
      <Pair label="best" value={formatTime(state.best)} />
      <Pair label="solves" value={String(state.count)} />
    </div>
  );
}

function Scramble({ state }: WidgetProps) {
  if (!state.scramble) return <span style={{ color: MUTED, textShadow: SHADOW }}>—</span>;
  return (
    <p className="font-mono" style={{ maxWidth: '22em', color: '#d8e2ec', textShadow: SHADOW }}>
      {state.scramble}
    </p>
  );
}

/**
 * The last few times, newest first.
 *
 * The best of what is shown is marked, because "is that a good one" is the
 * question a viewer asks about a list of numbers and the alternative is
 * explaining it out loud every time.
 */
function Solves({ state, rows }: WidgetProps) {
  const list = state.recent.slice(0, rows);
  const best = list.length ? Math.min(...list.filter(Number.isFinite)) : NaN;
  if (!list.length) {
    return <span style={{ color: MUTED, textShadow: SHADOW }}>no solves yet</span>;
  }
  return (
    <ol className="flex flex-col gap-[0.12em] font-mono" style={{ textShadow: SHADOW }}>
      {list.map((ms, i) => (
        <li key={i} className="flex items-baseline gap-[0.5em]">
          <span className="tnum" style={{ color: MUTED, fontSize: '0.75em', width: '1.6em' }}>
            {state.count - i}
          </span>
          <span
            className="tnum font-semibold"
            style={{ color: ms === best ? 'var(--color-good)' : '#fff' }}
          >
            {formatTime(ms)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The step splits of the last solve, the app's own ribbon. */
function Ribbon({ state }: WidgetProps) {
  const total = state.steps.reduce((a, s) => a + s.durationMs, 0);
  if (!state.steps.length || !total) {
    return <span style={{ color: MUTED, textShadow: SHADOW }}>no splits yet</span>;
  }
  return (
    <div className="flex flex-col gap-[0.25em]" style={{ width: '16em' }}>
      <div className="flex overflow-hidden rounded-[0.15em]" style={{ height: '0.6em' }}>
        {state.steps.map((s) => (
          <span key={s.key} style={{ width: `${(s.durationMs / total) * 100}%`, background: stepColor(s.key) }} />
        ))}
      </div>
      <div className="flex">
        {state.steps.map((s) => {
          const pct = (s.durationMs / total) * 100;
          return (
            <span
              key={s.key}
              className="tnum overflow-hidden text-center font-mono font-semibold whitespace-nowrap"
              style={{ width: `${pct}%`, fontSize: '0.62em', color: stepColor(s.key), textShadow: SHADOW }}
            >
              {pct >= 11 ? `${shortStep(s.key)} ${formatSeconds(s.durationMs)}` : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * How the target is going.
 *
 * A count on its own says nothing — five sub-tens out of six is a different
 * session from five out of two hundred — so the share is shown with it, and a
 * bar because a bar is read without being read.
 */
function Goal({ state }: WidgetProps) {
  const share = state.count > 0 ? state.goalHits / state.count : 0;
  return (
    <div className="flex flex-col gap-[0.25em] font-mono" style={{ width: '9em', textShadow: SHADOW }}>
      <div className="flex items-baseline justify-between">
        <span style={{ color: MUTED, fontSize: '0.8em' }}>sub {Math.round(state.goalMs / 1000)}</span>
        <span className="tnum font-semibold" style={{ color: 'var(--color-good)' }}>
          {state.goalHits}
          <span style={{ color: MUTED, fontSize: '0.75em' }}>/{state.count}</span>
        </span>
      </div>
      <div className="overflow-hidden rounded-[0.15em]" style={{ height: '0.4em', background: 'rgba(255,255,255,0.16)' }}>
        <span
          className="block h-full"
          style={{ width: `${Math.round(share * 100)}%`, background: 'var(--color-good)' }}
        />
      </div>
      <span className="tnum" style={{ color: MUTED, fontSize: '0.72em' }}>
        {state.count ? `${Math.round(share * 100)}%` : 'no solves yet'}
      </span>
    </div>
  );
}

/** Everything at once, for one source rather than five. */
function All(props: WidgetProps) {
  const { state } = props;
  return (
    <div className="flex flex-col gap-[0.5em]">
      <Clock {...props} />
      {state.steps.length > 0 && state.phase !== 'running' && state.finalMs != null && <Ribbon {...props} />}
      <Stats {...props} />
      <Goal {...props} />
      {state.phase !== 'running' && <Scramble {...props} />}
    </div>
  );
}

/* ---------------- the catalogue ---------------- */

export interface Widget {
  id: WidgetId;
  name: string;
  what: string;
  render: (props: WidgetProps) => ReactNode;
  /** Blocks that show a list take a row count */
  rows?: boolean;
  /** A sensible starting size, in px per em */
  scale: number;
}

export const WIDGETS: Widget[] = [
  { id: 'clock', name: 'Clock', what: 'The running time, and the last one when it stops', render: Clock, scale: 26 },
  { id: 'solves', name: 'Solve list', what: 'The last few times, best marked', render: Solves, rows: true, scale: 22 },
  { id: 'scramble', name: 'Scramble', what: 'What you are about to solve', render: Scramble, scale: 20 },
  { id: 'ribbon', name: 'Step splits', what: 'FB, SB, CMLL and LSE of the last solve', render: Ribbon, scale: 22 },
  { id: 'goal', name: 'Sub-X progress', what: 'How many are under the target, and the share', render: Goal, scale: 24 },
  { id: 'stats', name: 'Averages', what: 'ao5, ao12, best and the count', render: Stats, scale: 22 },
  { id: 'all', name: 'Everything', what: 'All of the above in one source', render: All, scale: 22 },
];

export const widgetById = (id: string): Widget => WIDGETS.find((w) => w.id === id) ?? WIDGETS[0];

/**
 * A plausible session, for the preview.
 *
 * The preview renders the real components, so it cannot drift from what OBS
 * will show. Feeding it invented numbers rather than the live ones means the
 * preview is worth looking at before a single solve has been done.
 */
export const SAMPLE: StreamState = {
  seq: 1,
  phase: 'done',
  session: 'Main session',
  scramble: "D' F2 D L2 R2 D2 R2 F' R' B D' F U2 L' F' L D' U'",
  elapsedMs: 0,
  inspectLeftMs: 0,
  finalMs: 9_640,
  penalty: 'none',
  steps: [
    { key: 'FB', label: 'First block', durationMs: 1_720, leadMs: 520 },
    { key: 'SB', label: 'Second block', durationMs: 2_650, leadMs: 780 },
    { key: 'CMLL', label: 'CMLL', durationMs: 2_010, leadMs: 900 },
    { key: 'EO', label: 'EO', durationMs: 1_090, leadMs: 260 },
    { key: 'LR', label: 'UL/UR', durationMs: 780, leadMs: 180 },
    { key: 'L4C', label: 'L4C', durationMs: 1_390, leadMs: 300 },
  ],
  count: 37,
  recent: [9_640, 10_820, 9_980, 11_240, 10_060, 9_310, 12_400, 10_550],
  ao5: 10_220,
  ao12: 10_640,
  best: 9_310,
  goalMs: 10_000,
  goalHits: 12,
};

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-[0.3em]">
      <span style={{ color: MUTED, fontSize: '0.8em' }}>{label}</span>
      <span className="tnum font-semibold" style={{ color: '#fff' }}>
        {value}
      </span>
    </span>
  );
}
