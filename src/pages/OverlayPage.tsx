/**
 * The overlay OBS loads as a Browser Source.
 *
 * Transparent background, no chrome, nothing interactive: it is a picture of
 * the session, drawn over whatever the camera is showing. The clock counts on
 * its own from the last thing it was told, so it stays smooth without sixty
 * messages a second and without the two machines having to agree what time it
 * is.
 *
 * Everything is sized in em against one font size, so a streamer who wants it
 * bigger changes one number in the URL rather than fighting OBS's scaling.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { RelayLink } from '../remote/relay';
import { decodeState, isStreamMessage, isNewer, EMPTY_STATE, type StreamState } from '../stream/protocol';
import { formatTime, formatSeconds } from '../analysis/stats';
import { stepColor, shortStep } from '../components/palette';

export default function OverlayPage({
  code,
  scale,
  backdrop = true,
}: {
  code: string;
  scale: number;
  /** A soft dark panel behind everything. On by default — see below. */
  backdrop?: boolean;
}) {
  const [state, setState] = useState<StreamState>(EMPTY_STATE);
  const [linked, setLinked] = useState(false);
  /** performance.now() when the running state arrived, for counting on */
  const startedAt = useRef<number | null>(null);
  const [shownMs, setShownMs] = useState(0);

  useEffect(() => {
    const link = new RelayLink();
    const off = link.on({
      status: (s) => setLinked(s === 'linked'),
      message: (m) => {
        if (!isStreamMessage(m)) return;
        const next = decodeState(m.state);
        if (!next) return;
        setState((cur) => {
          if (!isNewer(next, cur)) return cur;
          // The clock restarts from whatever had already passed when this was
          // sent, so nothing absolute has to cross the wire
          if (next.phase === 'running') {
            startedAt.current = performance.now() - next.elapsedMs;
          } else {
            startedAt.current = null;
          }
          return next;
        });
      },
    });
    link.join(code);
    return () => {
      off();
      link.stop();
    };
  }, [code]);

  // Counting on locally: smooth, and costs the network nothing
  useEffect(() => {
    if (state.phase !== 'running') return;
    let raf = 0;
    const tick = () => {
      if (startedAt.current !== null) setShownMs(performance.now() - startedAt.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.phase]);

  const clock = useMemo(() => {
    if (state.phase === 'inspecting') return (state.inspectLeftMs / 1000).toFixed(1);
    if (state.phase === 'running') return formatTime(shownMs);
    if (state.penalty === 'DNF') return 'DNF';
    if (state.finalMs != null) return formatTime(state.finalMs);
    return '—';
  }, [state, shownMs]);

  const tone =
    state.phase === 'inspecting'
      ? 'var(--color-warn)'
      : state.phase === 'running'
        ? '#ffffff'
        : state.finalMs != null && state.finalMs <= state.goalMs
          ? 'var(--color-good)'
          : '#ffffff';

  const totalSteps = state.steps.reduce((a, s) => a + s.durationMs, 0) || 1;

  return (
    /**
     * The backdrop is on by default, because legibility over arbitrary video is
     * the whole job of an overlay and a drop shadow alone loses to a bright
     * frame. `&bg=0` turns it off for anyone who would rather composite it
     * themselves.
     */
    <div
      style={{
        fontSize: `${scale}px`,
        background: backdrop ? 'rgba(10,14,20,0.62)' : 'transparent',
        borderRadius: backdrop ? '0.5em' : 0,
        backdropFilter: backdrop ? 'blur(0.25em)' : undefined,
      }}
      className="pointer-events-none inline-flex select-none flex-col gap-[0.5em] p-[0.7em] font-sans"
    >
      {/* The clock. A solve that beat the target is green, which is the one
          thing a viewer should be able to read without being told. */}
      <div className="flex items-end gap-[0.5em]">
        <span
          className="tnum font-mono leading-none font-semibold"
          style={{ fontSize: '3.4em', color: tone, textShadow: '0 0.06em 0.18em rgba(0,0,0,0.75)' }}
        >
          {clock}
          {state.penalty === '+2' && <span style={{ color: 'var(--color-bad)' }}>+2</span>}
        </span>
        {!linked && (
          <span className="text-[0.8em] opacity-60" style={{ color: 'var(--color-warn)' }}>
            waiting for the trainer…
          </span>
        )}
      </div>

      {/* Step splits of the solve just done, the app's own ribbon shape */}
      {/* Not gated on the 'done' phase: the trainer deals the next scramble
          the instant a solve lands, so that phase lasts one tick. The splits
          are worth showing for as long as the time beside them is. */}
      {state.steps.length > 0 && state.phase !== 'running' && state.finalMs != null && (
        <div className="flex flex-col gap-[0.25em]" style={{ width: '16em' }}>
          <div className="flex overflow-hidden rounded-[0.15em]" style={{ height: '0.55em' }}>
            {state.steps.map((s) => (
              <span
                key={s.key}
                style={{ width: `${(s.durationMs / totalSteps) * 100}%`, background: stepColor(s.key) }}
              />
            ))}
          </div>
          <div className="flex">
            {state.steps.map((s) => {
              const pct = (s.durationMs / totalSteps) * 100;
              return (
                <span
                  key={s.key}
                  className="tnum overflow-hidden text-center font-mono font-semibold whitespace-nowrap"
                  style={{
                    width: `${pct}%`,
                    fontSize: '0.62em',
                    color: stepColor(s.key),
                    textShadow: '0 0.06em 0.18em rgba(0,0,0,0.9)',
                  }}
                >
                  {pct >= 11 ? `${shortStep(s.key)} ${formatSeconds(s.durationMs)}` : ''}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* The numbers a viewer actually asks about */}
      <div
        className="flex flex-wrap items-baseline gap-x-[0.9em] gap-y-[0.2em] font-mono"
        style={{ fontSize: '0.95em', textShadow: '0 0.06em 0.18em rgba(0,0,0,0.85)' }}
      >
        <Figure label="ao5" value={formatTime(state.ao5)} />
        <Figure label="ao12" value={formatTime(state.ao12)} />
        <Figure label="best" value={formatTime(state.best)} />
        <Figure label="solves" value={String(state.count)} />
        {/* The point of the stream, so it is not something the chat has to ask */}
        <Figure
          label={`sub ${Math.round(state.goalMs / 1000)}`}
          value={`${state.goalHits}`}
          accent="var(--color-good)"
        />
      </div>

      {state.scramble && state.phase !== 'running' && (
        <p
          className="font-mono"
          style={{
            fontSize: '0.8em',
            maxWidth: '22em',
            color: '#d8e2ec',
            textShadow: '0 0.06em 0.18em rgba(0,0,0,0.9)',
          }}
        >
          {state.scramble}
        </p>
      )}
    </div>
  );
}

function Figure({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <span className="flex items-baseline gap-[0.3em]">
      <span style={{ color: '#9fb0c2', fontSize: '0.8em' }}>{label}</span>
      <span className="tnum font-semibold" style={{ color: accent ?? '#fff' }}>
        {value}
      </span>
    </span>
  );
}
