import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/app';
import { db, type Solve } from '../store/db';
import { parseAlg } from '../cube/alg';
import { applyPerm } from '../cube/cube';
import { analyzeSolveRecord, analyzeMany } from '../analysis/pipeline';
import { buildMoveBaseline, reviewSolve, VERDICT_COLORS, type MoveRating, type SolveReview } from '../analysis/moveReview';
import { stepHighlight } from '../analysis/method';
import { reconstruct } from '../analysis/reconstruction';
import { effectiveTime, formatSeconds, formatTime } from '../analysis/stats';
import CubeView from '../components/CubeView';
import StepRibbon from '../components/StepRibbon';
import ScrambleDisplay from '../components/ScrambleDisplay';
import { stepColor } from '../components/palette';
import { reviewSolveOutcome, topRemarks } from '../analysis/review';

const SPEEDS = [0.25, 0.5, 1, 2];

export default function ReplayPage({ solveId, onBack }: { solveId: number; onBack: () => void }) {
  const { settings } = useApp();
  const [solve, setSolve] = useState<Solve | null>(null);
  const [corpus, setCorpus] = useState<Solve[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [pauseAtSteps, setPauseAtSteps] = useState(true);
  const [anim, setAnim] = useState<{ move: string; progress: number } | null>(null);
  const animRef = useRef(0);
  const [viewMode, setViewMode] = useState<'3d' | 'net' | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    void db.solves.get(solveId).then((s) => {
      setSolve(s ?? null);
      setIndex(0);
    });
  }, [solveId]);

  // The baseline comes from the solver's own history. Capping it at the last 150
  // solves keeps it quick and reflects current form rather than early days.
  useEffect(() => {
    void db.solves.orderBy('date').reverse().limit(150).toArray().then(setCorpus);
  }, []);

  const analysis = useMemo(() => (solve ? analyzeSolveRecord(solve, settings) : null), [solve, settings]);
  const baseline = useMemo(() => buildMoveBaseline(analyzeMany(corpus, settings)), [corpus, settings]);
  const review = useMemo(() => (analysis ? reviewSolve(analysis, baseline) : null), [analysis, baseline]);
  const scramble = useMemo(() => (solve ? parseAlg(solve.scramble) : []), [solve]);

  /** Step boundaries by move index, so the current step is known */
  const boundaries = useMemo(() => analysis?.steps.map((s) => s.endIndex) ?? [], [analysis]);
  const currentStep = useMemo(() => {
    if (!analysis) return null;
    return analysis.steps.find((s) => index > s.startIndex && index <= s.endIndex) ?? analysis.steps[0] ?? null;
  }, [analysis, index]);

  /** View angle: follows the most recently completed step so the cube stays put */
  const viewRotation = useMemo(() => {
    if (!analysis) return null;
    let rot: Uint8Array | null = null;
    for (const s of analysis.steps) {
      if (s.detected && s.endIndex <= index) rot = s.rotation;
    }
    return rot ?? analysis.steps.find((s) => s.detected)?.rotation ?? null;
  }, [analysis, index]);

  const total = analysis?.moves.length ?? 0;

  /** Seeing the layer turn is far easier to follow than jumping between frames. */
  const animMs = useCallback(
    (moveIndex: number) => {
      if (!analysis) return 120;
      const prevT = moveIndex === 0 ? 0 : analysis.moves[moveIndex - 1].t;
      const gap = (analysis.moves[moveIndex]?.t ?? prevT + 200) - prevT;
      // Tracks the real cadence but stays long enough to see and short enough not to drag
      return Math.min(320, Math.max(90, (gap / speed) * 0.75));
    },
    [analysis, speed],
  );

  const stopAnim = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = 0;
    setAnim(null);
  }, []);

  /** Seek to a position; a single step forward animates the turning layer. */
  const seek = useCallback(
    (target: number, animated = false) => {
      stopAnim();
      if (!analysis) return;
      const clamped = Math.max(0, Math.min(total, target));
      if (!animated || clamped !== index + 1) {
        setIndex(clamped);
        return;
      }
      const move = analysis.moves[index].move;
      const duration = animMs(index);
      const t0 = performance.now();
      const tick = () => {
        const progress = Math.min(1, (performance.now() - t0) / duration);
        setAnim({ move, progress });
        if (progress < 1) {
          animRef.current = requestAnimationFrame(tick);
        } else {
          animRef.current = 0;
          setAnim(null);
          setIndex(clamped);
          // Only stop on ARRIVING at a step boundary. In its own effect this
          // would stop immediately when Play is pressed while already on one.
          if (pauseAtSteps && clamped < total && boundaries.includes(clamped)) setPlaying(false);
        }
      };
      animRef.current = requestAnimationFrame(tick);
    },
    [analysis, index, total, animMs, stopAnim, pauseAtSteps, boundaries],
  );

  // Replays at the solve's real cadence, minus the time spent animating
  useEffect(() => {
    if (!playing || !analysis) return;
    if (index >= total) {
      setPlaying(false);
      return;
    }
    const prevT = index === 0 ? 0 : analysis.moves[index - 1].t;
    const gap = Math.min(2500, Math.max(40, (analysis.moves[index].t - prevT) / speed));
    const wait = Math.max(0, gap - animMs(index));
    timerRef.current = window.setTimeout(() => seek(index + 1, true), wait);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [playing, index, analysis, speed, total, animMs, seek]);

  useEffect(() => () => stopAnim(), [stopAnim]);

  if (!solve) return <p className="text-sm text-ink-400">Loading…</p>;

  if (!analysis) {
    return (
      <div className="panel p-6">
        <button className="btn btn-ghost mb-4" onClick={onBack}>
          Back
        </button>
        <p className="text-lg">
          {formatTime(effectiveTime(solve))} — {new Date(solve.date).toLocaleString('en-GB')}
        </p>
        <ScrambleDisplay moves={parseAlg(solve.scramble)} size="md" className="mt-2" />
        <p className="mt-4 text-sm text-ink-400">
          This solve was timed by hand, so there is no move data to replay.
        </p>
      </div>
    );
  }

  const state = analysis.states[index];
  // Highlight by piece COLOUR, on the state rotated into the display frame — so
  // the step's own pieces light up even while still scattered around the cube.
  const viewed = viewRotation ? applyPerm(state, viewRotation) : state;
  const highlight = currentStep ? stepHighlight(currentStep.key, viewed, analysis.colors) : null;
  const remarks = topRemarks(reviewSolveOutcome(analysis, settings.timerMode));
  const elapsed = index === 0 ? 0 : analysis.moves[index - 1].t;

  const jumpToStep = (key: string) => {
    const s = analysis.steps.find((x) => x.key === key);
    if (s) {
      setPlaying(false);
      seek(s.startIndex);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-4">
          <button className="btn btn-ghost" onClick={onBack}>
            Back
          </button>
          <span className="tnum font-mono text-2xl font-semibold">{formatTime(effectiveTime(solve))}</span>
          <span className="text-[13px] text-ink-400">{new Date(solve.date).toLocaleString('en-GB')}</span>
        </div>
        <ScrambleDisplay moves={scramble} size="md" className="!text-ink-300" />
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Cube and replay controls */}
        <section className="panel p-4">
          <div className="flex justify-center">
            <CubeView
              state={state}
              viewRotation={viewRotation}
              highlight={highlight}
              size={240}
              force={viewMode ?? undefined}
              animate={anim}
              interactive
            />
          </div>
          <div className="mt-2 flex justify-center gap-1">
            <button
              className={`btn !px-2 !py-0.5 !text-[12px] ${viewMode === '3d' ? '!border-cube-blue !text-cube-blue' : ''}`}
              onClick={() => setViewMode('3d')}
            >
              3D
            </button>
            <button
              className={`btn !px-2 !py-0.5 !text-[12px] ${viewMode === 'net' ? '!border-cube-blue !text-cube-blue' : ''}`}
              onClick={() => setViewMode('net')}
              title="Net — all six faces at once"
            >
              Net
            </button>
          </div>
          <div className="mt-4 text-center">
            <p className="text-[13px] text-ink-400">
              {currentStep ? currentStep.label : 'Before the solve'} · move {index}/{total}
            </p>
            <p className="tnum mt-0.5 font-mono text-lg">{formatSeconds(elapsed)}s</p>
          </div>
          <div className="mt-4 flex items-center justify-center gap-1.5">
            <button className="btn !px-2.5" onClick={() => { setPlaying(false); seek(0); }} title="To the start">
              ⏮
            </button>
            <button
              className="btn !px-2.5"
              onClick={() => { setPlaying(false); seek(index - 1); }}
              title="Back one move"
            >
              ◀
            </button>
            <button className="btn btn-primary !px-4" onClick={() => setPlaying(!playing)}>
              {playing ? 'Pause' : index >= total ? 'Replay' : 'Play'}
            </button>
            <button
              className="btn !px-2.5"
              onClick={() => { setPlaying(false); seek(index + 1, true); }}
              title="Forward one move"
            >
              ▶
            </button>
            <button className="btn !px-2.5" onClick={() => { setPlaying(false); seek(total); }} title="To the end">
              ⏭
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-[13px]">
            <div className="flex items-center gap-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  className={`btn !px-2 !py-0.5 !text-[12px] ${speed === s ? '!border-cube-blue !text-cube-blue' : ''}`}
                  onClick={() => setSpeed(s)}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px] text-ink-300">
            <input type="checkbox" checked={pauseAtSteps} onChange={(e) => setPauseAtSteps(e.target.checked)} />
            Stop at the end of each step
          </label>
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          <section className="panel p-4">
            <StepRibbon
              steps={analysis.steps}
              totalMs={analysis.totalMs}
              height={16}
              showLabels
              activeKey={currentStep?.key ?? null}
              onSelect={jumpToStep}
            />
            <ul className="mt-3 flex flex-col gap-1.5">
              {remarks.map((r, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span
                    className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full"
                    style={{ background: r.key ? stepColor(r.key) : 'var(--color-ink-400)' }}
                  />
                  <span
                    className={`text-[13px] ${r.tone === 'good' ? 'text-good' : r.tone === 'bad' ? 'text-bad' : 'text-warn'}`}
                  >
                    {r.text}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {review && (
            <MoveReviewPanel
              review={review}
              current={review.ratings.find((r) => r.index === index) ?? null}
              onJump={(i) => {
                setPlaying(false);
                seek(i);
              }}
            />
          )}

          {/* Grouped by step, in the frame the cube was held in */}
          <section className="panel p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="shrink-0 text-sm font-semibold">Reconstruction</h2>
              <span className="flex flex-wrap items-center gap-3 text-[12px] text-ink-500">
                {(['very fast', 'normal', 'slow', 'stuck'] as const).map((v) => (
                  <span key={v} className="flex items-center gap-1">
                    <span className="inline-block h-[3px] w-3 rounded-[1px]" style={{ background: VERDICT_COLORS[v] }} />
                    {v}
                  </span>
                ))}
              </span>
            </div>
            <MoveTape
              analysis={analysis}
              review={review}
              index={index}
              onSeek={(i) => {
                setPlaying(false);
                seek(i);
              }}
            />
          </section>

          <section className="panel overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Step</th>
                  <th className="text-right">Time</th>
                  <th className="text-right">%</th>
                  <th className="text-right">Moves</th>
                  <th className="text-right">TPS</th>
                  <th className="text-right">Pauses</th>
                </tr>
              </thead>
              <tbody>
                {analysis.steps.map((s) => (
                  <tr key={s.key} className="cursor-pointer" onClick={() => jumpToStep(s.key)}>
                    <td>
                      <span className="mr-2 inline-block size-2 rounded-[2px]" style={{ background: stepColor(s.key) }} />
                      {s.label}
                      {!s.detected && <span className="ml-2 text-[12px] text-ink-500">not detected</span>}
                    </td>
                    <td className="tnum text-right font-mono">{formatSeconds(s.durationMs)}</td>
                    <td className="tnum text-right text-ink-400">
                      {Math.round((s.durationMs / analysis.totalMs) * 100)}%
                    </td>
                    <td className="tnum text-right">{s.moveCount}</td>
                    <td className="tnum text-right">{s.tps.toFixed(1)}</td>
                    <td className="tnum text-right">
                      {s.pauses.length ? (
                        <span className="text-warn">
                          {s.pauses.length} · {formatSeconds(s.pauseMs)}s
                        </span>
                      ) : (
                        <span className="text-ink-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}

function MoveTape({
  analysis,
  review,
  index,
  onSeek,
}: {
  analysis: NonNullable<ReturnType<typeof analyzeSolveRecord>>;
  review: SolveReview | null;
  index: number;
  onSeek: (i: number) => void;
}) {
  const steps = reconstruct(analysis);
  const maxDelta = Math.max(1, ...analysis.moves.map((m, i) => (i === 0 ? 0 : m.t - analysis.moves[i - 1].t)));
  const ratingOf = (i: number) => review?.ratings.find((r) => r.index === i) ?? null;
  const shown = steps.filter((s) => s.moves.length || s.rotation.length);

  return (
    <div className="flex flex-col gap-3">
      {shown.map((step) => (
        <div key={step.key}>
          <div className="mb-1 flex items-baseline gap-1.5">
            <span className="inline-block size-2 shrink-0 rounded-[2px]" style={{ background: stepColor(step.key) }} />
            <span className="text-[12px] text-ink-400">{step.label}</span>
            <span className="tnum font-mono text-[12px] text-ink-500">{formatSeconds(step.durationMs)}s</span>
            <span className="tnum text-[11px] text-ink-600">{step.moves.length}n</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {step.rotation.map((r, k) => (
              <span
                key={'r' + k}
                title="Whole-cube rotations turn no face, so the cube cannot report them. This one is inferred from the orientation the next step was recognised in."
                className="flex items-center rounded-[3px] border border-dashed border-ink-600 px-1.5 py-1 font-mono text-[13px] italic text-ink-500"
              >
                {r}
              </span>
            ))}
            {step.moves.map((m) => {
              const rating = ratingOf(m.index - 1);
              const color = rating ? VERDICT_COLORS[rating.verdict] : stepColor(step.key);
              const active = index === m.index;
              return (
                <button
                  key={m.index}
                  type="button"
                  onClick={() => onSeek(m.index)}
                  title={
                    rating
                      ? `${m.move} · ${Math.round(m.deltaMs)}ms · ${rating.verdict} (usually ${Math.round(rating.baselineMs)}ms, based on ${rating.basis})`
                      : `${m.move} · ${Math.round(m.deltaMs)}ms`
                  }
                  className="relative flex flex-col items-center rounded-[3px] border px-1.5 py-1 font-mono text-[13px] transition-colors"
                  style={{
                    borderColor: active ? stepColor(step.key) : 'var(--color-ink-700)',
                    background: active ? 'color-mix(in srgb, ' + stepColor(step.key) + ' 22%, transparent)' : 'transparent',
                    color: rating && rating.verdict !== 'normal' ? color : 'var(--color-ink-100)',
                  }}
                >
                  <span>{m.move}</span>
                  <span
                    className="mt-1 block rounded-[1px]"
                    style={{
                      width: Math.max(3, (m.deltaMs / maxDelta) * 26) + 'px',
                      height: '3px',
                      background: color,
                      opacity: rating?.verdict === 'normal' ? 0.5 : 1,
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A chess-style game review, except the scale is fast versus slow. */
function MoveReviewPanel({
  review,
  current,
  onJump,
}: {
  review: SolveReview;
  current: MoveRating | null;
  onJump: (index: number) => void;
}) {
  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Move review</h2>
        <span className="text-[12px] text-ink-500">vs your pace over {review.baselineSolves} solves</span>
      </div>

      {!review.reliable && (
        <p className="mt-2 text-[12px] text-warn">Baseline is still thin.</p>
      )}

      {review.lostMs > 250 ? (
        <p className="mt-3 max-w-[68ch] text-sm text-ink-200">
          <span className="tnum font-mono text-lg text-bad">{formatSeconds(review.lostMs)}s</span> lost across{' '}
          {review.slowest.length} unusually slow moves. At your usual pace on those moves, this solve would have
          been <span className="tnum font-mono text-good">{formatSeconds(review.potentialMs)}s</span>.
        </p>
      ) : (
        <p className="mt-3 text-sm text-good">
          Nothing stalled out of the ordinary — the whole solve ran at your usual rhythm.
        </p>
      )}

      {review.slowest.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {review.slowest.map((r) => (
            <li key={r.index}>
              <button
                type="button"
                onClick={() => onJump(r.index)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 rounded-[4px] px-2 py-1 text-left hover:bg-ink-800"
              >
                <span className="tnum w-7 shrink-0 text-[12px] text-ink-500">#{r.index}</span>
                <span className="w-[5.5rem] shrink-0 font-mono text-[13px]">
                  {r.prevMove} <span className="text-ink-500">→</span> {r.move}
                </span>
                <span className="tnum w-16 shrink-0 font-mono text-[13px]" style={{ color: VERDICT_COLORS[r.verdict] }}>
                  {Math.round(r.deltaMs)}ms
                </span>
                <span className="tnum shrink-0 text-[12px] text-ink-400">usually {Math.round(r.baselineMs)}ms</span>
                <span className="hidden min-w-0 flex-1 truncate text-[12px] text-ink-400 sm:block">{r.stepLabel}</span>
                <span className="shrink-0 text-[12px]" style={{ color: VERDICT_COLORS[r.verdict] }}>
                  {r.verdict}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {current && (
        <p className="mt-3 border-t border-ink-700 pt-3 text-[13px] text-ink-300">
          Current move:{' '}
          <span className="font-mono text-ink-100">
            {current.prevMove} → {current.move}
          </span>{' '}
          took <span className="tnum font-mono">{Math.round(current.deltaMs)}ms</span>, you usually take{' '}
          <span className="tnum font-mono">{Math.round(current.baselineMs)}ms</span> —{' '}
          <span style={{ color: VERDICT_COLORS[current.verdict] }}>{current.verdict}</span>{' '}
          <span className="text-ink-500">(based on {current.basis})</span>
        </p>
      )}
    </section>
  );
}
