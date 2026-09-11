/**
 * Drilling random cases from one or more families — csTimer's subset trainer.
 *
 * The shape of it is a loop you never have to interrupt. Press start once; from
 * then on, solving a case deals the next one immediately, and the one you just
 * did stays on screen with its own history while you set the next up. Pressing
 * a button between every case, and losing the result the moment you did, made
 * the thing unusable for actual practice.
 *
 * One thing worth saying plainly: the setup sequence is just the algorithm
 * reversed, so seeing the whole thing gives the case away. That is why only ONE
 * MOVE AT A TIME is shown by default — turning it mechanically still leaves you
 * to recognise the case at the end. A button reveals the full sequence.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AlgEntry, Rep } from '../store/db';
import { db } from '../store/db';
import { invertAlg, parseAlg } from '../cube/alg';
import { SOLVED_STATE, isSolved, cloneState, type CubeState } from '../cube/cube';
import { ScrambleTracker, type ScrambleProgress } from '../analysis/scrambleGuide';
import { DrillMatcher, caseStateFor } from '../analysis/drill';
import { useCubeInput } from '../smartcube/useCubeInput';
import { cubeLink } from '../smartcube/connection';
import { useTurnAnimation } from './useTurnAnimation';
import { formatSeconds } from '../analysis/stats';
import CubeView from './CubeView';
import ScrambleGuide from './ScrambleGuide';

type Phase = 'idle' | 'setup' | 'armed' | 'running';

interface Attempt {
  algId: number;
  entry: AlgEntry;
  execMs: number;
  recognitionMs: number;
  moveTimes: (number | null)[];
  at: number;
}

interface Props {
  pool: AlgEntry[];
  usingCube: boolean;
  keyboard: boolean;
  repCounts: Map<number, number>;
  onRepSaved: () => void;
}

/** Pick a random case, favouring undrilled ones and avoiding an immediate repeat. */
function pickCase(pool: AlgEntry[], repCounts: Map<number, number>, avoidId: number | null): AlgEntry | null {
  const candidates = pool.filter((a) => a.id != null && (pool.length === 1 || a.id !== avoidId));
  if (!candidates.length) return null;
  const weights = candidates.map((a) => ((repCounts.get(a.id!) ?? 0) === 0 ? 3 : 1));
  const total = weights.reduce((x, y) => x + y, 0);
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

export default function CaseTrainer({ pool, usingCube, keyboard, repCounts, onRepSaved }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [target, setTarget] = useState<AlgEntry | null>(null);
  const [progress, setProgress] = useState<ScrambleProgress | null>(null);
  const [reveal, setReveal] = useState(false);
  const [last, setLast] = useState<Attempt | null>(null);
  const [history, setHistory] = useState<Attempt[]>([]);
  /** Every time recorded for these cases, so "your best" means all time */
  const [past, setPast] = useState<Map<number, number[]>>(new Map());
  const [cubeState, setCubeState] = useState<CubeState>(() => cloneState(SOLVED_STATE));
  const live = useTurnAnimation();

  const phaseRef = useRef<Phase>('idle');
  const targetRef = useRef<AlgEntry | null>(null);
  const trackerRef = useRef<ScrambleTracker | null>(null);
  const matcherRef = useRef<DrillMatcher | null>(null);
  const armedAtRef = useRef(0);
  const startRef = useRef(0);
  const cubeRef = useRef<CubeState>(cloneState(SOLVED_STATE));

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const moves = useMemo(() => {
    if (!target) return [];
    try {
      return parseAlg(target.alg);
    } catch {
      return [];
    }
  }, [target]);

  const setup = useMemo(() => {
    if (!moves.length) return [];
    // Reversing the algorithm produces the case; a random U adds an AUF to find
    const auf = ['', 'U', "U'", 'U2'][Math.floor(Math.random() * 4)];
    return auf ? [...invertAlg(moves), auf] : invertAlg(moves);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves, target?.id]);

  /** Deal the next case. Used to start, to skip, and straight after a solve. */
  const deal = useCallback(() => {
    const picked = pickCase(pool, repCounts, targetRef.current?.id ?? null);
    targetRef.current = picked;
    setTarget(picked);
    matcherRef.current = null;
    setReveal(false);
    setPhaseBoth(picked ? 'setup' : 'idle');
  }, [pool, repCounts]);

  const stop = useCallback(() => {
    setPhaseBoth('idle');
    setTarget(null);
    targetRef.current = null;
    setProgress(null);
  }, []);

  /**
   * Which cases are in scope, as a value rather than an array identity.
   *
   * Saving a rep reloads the algorithm list, which hands down a brand new array
   * every time. Keying off that array meant the drill stopped itself and threw
   * the session away after every single case — which is what made it feel like
   * it demanded a fresh start each time.
   */
  const poolKey = useMemo(() => pool.map((a) => a.id).join(','), [pool]);

  // Changing the scope stops the drill rather than jumping to another family
  useEffect(() => {
    stop();
    setHistory([]);
    setLast(null);
  }, [poolKey, stop]);

  // Load what has been done before, so a result can be held against your own
  // history rather than just this sitting
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ids = pool.map((a) => a.id).filter((id): id is number => id != null);
      const rows = ids.length ? await db.reps.where('algId').anyOf(ids).toArray() : [];
      if (cancelled) return;
      const map = new Map<number, number[]>();
      for (const r of rows) {
        if (!r.success) continue;
        if (!map.has(r.algId)) map.set(r.algId, []);
        map.get(r.algId)!.push(r.execMs);
      }
      setPast(map);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolKey]);

  // A reset in the middle of a timed rep would throw the rep away
  useEffect(() => {
    if (phase !== 'armed' && phase !== 'running') return;
    return cubeLink.holdResetGesture();
  }, [phase]);

  // Rebuild the guide whenever a new case comes up
  useEffect(() => {
    if (!setup.length) return;
    const tracker = new ScrambleTracker(setup);
    trackerRef.current = tracker;
    setProgress(tracker.update(cubeRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup]);

  const arm = useCallback(() => {
    const entry = targetRef.current;
    if (!entry) return;
    const alg = parseAlg(entry.alg);
    matcherRef.current = new DrillMatcher(alg, caseStateFor(alg, SOLVED_STATE));
    armedAtRef.current = performance.now();
    setPhaseBoth('armed');
  }, []);

  const finish = useCallback(
    async (execMs: number, recognitionMs: number, moveTimes: (number | null)[]) => {
      const entry = targetRef.current;
      if (!entry?.id) return;
      const attempt: Attempt = { algId: entry.id, entry, execMs, recognitionMs, moveTimes, at: Date.now() };
      setLast(attempt);
      setHistory((h) => [...h, attempt]);
      setPast((m) => {
        const next = new Map(m);
        next.set(entry.id!, [...(next.get(entry.id!) ?? []), execMs]);
        return next;
      });
      // Straight on to the next one. Stopping to press a button here is what
      // made the drill feel like paperwork.
      deal();

      const rep: Omit<Rep, 'id'> = {
        algId: entry.id,
        date: attempt.at,
        recognitionMs,
        execMs,
        moveTimes,
        extraMoves: 0,
        success: true,
      };
      await db.reps.add(rep);
      onRepSaved();
    },
    [deal, onRepSaved],
  );

  useCubeInput(
    {
      onState: (s, fromCube) => {
        cubeRef.current = s;
        setCubeState(s);
        if (fromCube) live.jump(s);
        if (phaseRef.current !== 'setup') return;
        const tracker = trackerRef.current;
        if (!tracker) return;
        const next = tracker.update(s);
        setProgress(next);
        if (next.status === 'complete' && targetRef.current) arm();
      },
      onMove: (m, state) => {
        live.turn(m.move, state);
        cubeRef.current = state;
        setCubeState(state);
        const p = phaseRef.current;

        if (p === 'setup') {
          const tracker = trackerRef.current;
          if (!tracker) return;
          const next = tracker.update(state, m.move);
          setProgress(next);
          if (next.status === 'complete' && targetRef.current) arm();
          return;
        }
        if (p !== 'armed' && p !== 'running') return;

        const t = m.cubeTs ?? m.localTs;
        if (p === 'armed') {
          startRef.current = t;
          setPhaseBoth('running');
        }
        // Still run the matcher so per-move times are captured WHEN the stored
        // algorithm is the one used; another algorithm only gets a total.
        const res = matcherRef.current?.feed(state, t);
        if (isSolved(state)) {
          const execMs = Math.max(0, t - startRef.current);
          const recognitionMs = Math.max(0, startRef.current - armedAtRef.current);
          void finish(execMs, recognitionMs, res?.event === 'complete' ? res.moveTimes : []);
        }
      },
    },
    keyboard,
  );

  /* ---------------- what to show ---------------- */

  const lastStats = useMemo(() => {
    if (!last) return null;
    const times = past.get(last.algId) ?? [];
    const best = times.length ? Math.min(...times) : NaN;
    return { reps: times.length, best, median: median(times), isBest: last.execMs <= best };
  }, [last, past]);

  const slowest = useMemo(() => {
    const byAlg = new Map<number, { entry: AlgEntry; times: number[] }>();
    for (const h of history) {
      if (!byAlg.has(h.algId)) byAlg.set(h.algId, { entry: h.entry, times: [] });
      byAlg.get(h.algId)!.times.push(h.execMs);
    }
    return [...byAlg.values()]
      .map((v) => ({ entry: v.entry, reps: v.times.length, median: median(v.times), best: Math.min(...v.times) }))
      .sort((a, b) => b.median - a.median);
  }, [history]);

  if (!usingCube) {
    return (
      <section className="panel p-5">
        <h2 className="text-base font-semibold">Random case drill</h2>
        <p className="mt-2 max-w-[60ch] text-sm text-ink-400">
          This mode needs a smart cube. Connect one from the top bar, or switch on the keyboard cube in Settings.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="panel px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-ink-400">
            {pool.length} cases in scope
            {history.length > 0 && <span className="text-ink-500"> · {history.length} done</span>}
          </p>
          <div className="flex gap-2">
            {phase === 'idle' ? (
              <button className="btn btn-primary !py-1 !text-[13px]" onClick={deal} disabled={!pool.length}>
                Start
              </button>
            ) : (
              <>
                <button className="btn !py-1 !text-[13px]" onClick={deal}>
                  Skip
                </button>
                <button className="btn !py-1 !text-[13px]" onClick={stop}>
                  Stop
                </button>
              </>
            )}
          </div>
        </div>

        {phase !== 'idle' && target && (
          <div className="mt-4 flex flex-col items-center gap-3">
            {phase === 'setup' &&
              (reveal ? (
                <div className="w-full">
                  <ScrambleGuide moves={setup} progress={progress} />
                </div>
              ) : (
                <div className="flex items-baseline gap-3">
                  <span
                    className={`font-mono text-4xl font-semibold leading-none ${
                      progress?.status === 'off-track' ? 'text-bad' : progress?.status === 'partial' ? 'text-warn' : 'text-cube-blue'
                    }`}
                  >
                    {progress?.status === 'off-track'
                      ? progress.fix.join(' ') || 'solve the cube'
                      : progress?.status === 'partial'
                        ? progress.remaining
                        : (progress?.next ?? '')}
                  </span>
                  <span className="tnum text-[13px] text-ink-500">
                    {progress?.done ?? 0}/{setup.length}
                  </span>
                </div>
              ))}

            {phase === 'setup' && (
              <button className="btn btn-ghost !px-2 !py-0.5 !text-[12px]" onClick={() => setReveal(!reveal)}>
                {reveal ? 'One move at a time' : 'Show the whole setup'}
              </button>
            )}

            {phase === 'armed' && (
              <p className="armed text-lg font-semibold text-good">In the case — recognise it and go</p>
            )}
            {phase === 'running' && <p className="text-lg font-semibold text-cube-blue">Running…</p>}

            <CubeView state={live.animate ? live.shown : cubeState} animate={live.animate} size={170} />
          </div>
        )}

        {phase === 'idle' && history.length === 0 && (
          <p className="mt-3 text-sm text-ink-400">Cases you have never drilled come up more often.</p>
        )}
      </section>

      {/* The case just finished stays here while the next one is being set up */}
      {last && lastStats && (
        <section className="panel px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-sm font-semibold">
              {last.entry.family} <span className="text-ink-400">· {last.entry.name}</span>
            </h2>
            <span className="text-[12px] text-ink-500">just done</span>
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className="tnum font-mono text-3xl font-semibold text-good">{formatSeconds(last.execMs)}s</span>
            {lastStats.isBest && lastStats.reps > 1 && (
              <span className="pop-in text-[13px] font-semibold text-warn">personal best</span>
            )}
            <span className="tnum text-[13px] text-ink-400">recognition {formatSeconds(last.recognitionMs)}s</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-ink-800 pt-3 text-[13px]">
            <Stat label="reps" value={String(lastStats.reps)} />
            <Stat label="best" value={`${formatSeconds(lastStats.best)}s`} />
            <Stat label="median" value={`${formatSeconds(lastStats.median)}s`} />
          </div>
          <p className="mt-2 font-mono text-[15px] text-ink-200">{last.entry.alg}</p>
        </section>
      )}

      {slowest.length > 1 && (
        <section className="panel overflow-hidden">
          <header className="flex items-baseline justify-between border-b border-ink-700 px-4 py-3">
            <h2 className="text-sm font-semibold">Slowest cases</h2>
            <span className="text-[12px] text-ink-500">this sitting</span>
          </header>
          <table className="data">
            <thead>
              <tr>
                <th>Case</th>
                <th className="text-right">Reps</th>
                <th className="text-right">Median</th>
                <th className="text-right">Best</th>
              </tr>
            </thead>
            <tbody>
              {slowest.map((s) => (
                <tr key={s.entry.id}>
                  <td>
                    {s.entry.family} <span className="text-ink-500">· {s.entry.name}</span>
                  </td>
                  <td className="tnum text-right">{s.reps}</td>
                  <td className="tnum text-right font-mono">{formatSeconds(s.median)}</td>
                  <td className="tnum text-right font-mono text-ink-400">{formatSeconds(s.best)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-ink-500">{label}</span>
      <span className="tnum font-mono text-ink-100">{value}</span>
    </span>
  );
}
