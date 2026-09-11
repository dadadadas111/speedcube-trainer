import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/app';
import { db, type Solve, type Penalty } from '../store/db';
import { generateScramble, type ScrambleSource } from '../cube/scramble';
import { SOLVED_STATE, applyMoves, isSolved, cloneState, type CubeState } from '../cube/cube';
import { cubeLink, normalizeTimestamps, type LiveMove } from '../smartcube/connection';
import { useCubeInput } from '../smartcube/useCubeInput';
import { useCubeGyro } from '../smartcube/useCubeGyro';
import { virtualCube } from '../smartcube/virtual';
import { ScrambleTracker, isAtStart, type ScrambleProgress } from '../analysis/scrambleGuide';
import { analyzeSolveRecord } from '../analysis/pipeline';
import { averageOf, effectiveTime, formatTime } from '../analysis/stats';
import CubeView from '../components/CubeView';
import { useTurnAnimation } from '../components/useTurnAnimation';
import ScrambleGuide from '../components/ScrambleGuide';
import CubeSync from '../components/CubeSync';
import PostSolve from '../components/PostSolve';
import StepRibbon from '../components/StepRibbon';

type Phase = 'scrambling' | 'ready' | 'inspecting' | 'holding' | 'armed' | 'running' | 'done';

const HOLD_MS = 350;
/** How long the hands have to be still before offering a way out of the solve */
const STUCK_MS = 3000;

export default function TimerPage({ onOpenSolve }: { onOpenSolve: (id: number) => void }) {
  const { settings, updateSettings, sessionId, cubeStatus, bump, revision } = useApp();
  const usingCube = cubeStatus === 'connected' || settings.keyboardCube;
  const slow = settings.timerMode === 'slow';

  const [scramble, setScramble] = useState<string[]>([]);
  const [scrambleSource, setScrambleSource] = useState<ScrambleSource>('random-state');
  const [phase, setPhase] = useState<Phase>('scrambling');
  const [display, setDisplay] = useState(0);
  const [inspectLeft, setInspectLeft] = useState(0);
  const [cubeState, setCubeState] = useState<CubeState>(cloneState(SOLVED_STATE));
  const [progress, setProgress] = useState<ScrambleProgress | null>(null);
  const [lastSolve, setLastSolve] = useState<Solve | null>(null);
  const [recent, setRecent] = useState<Solve[]>([]);
  const [stuck, setStuck] = useState(false);
  /** Live move count — what slow mode puts on screen in place of the clock */
  const [moveCount, setMoveCount] = useState(0);
  const [showSync, setShowSync] = useState(false);

  const phaseRef = useRef<Phase>('scrambling');
  const lastMoveAtRef = useRef(0);
  const movesRef = useRef<LiveMove[]>([]);
  const startRef = useRef(0);
  const scrambleRef = useRef<string[]>([]);
  const trackerRef = useRef<ScrambleTracker | null>(null);
  const rafRef = useRef(0);
  const holdRef = useRef<number | null>(null);

  const quaternion = useCubeGyro(settings.useGyro && cubeStatus === 'connected');
  // The cube on screen turns its layer instead of jumping to the next position
  const live = useTurnAnimation();

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const targetState = useMemo(() => applyMoves(SOLVED_STATE, scramble), [scramble]);

  /* ---------- new scramble ---------- */
  const newScramble = useCallback(async () => {
    const { moves, source } = await generateScramble(settings.randomStateScramble);
    scrambleRef.current = moves;
    setScramble(moves);
    setScrambleSource(source);
    const tracker = new ScrambleTracker(moves);
    trackerRef.current = tracker;
    setProgress(usingCube ? tracker.update(cubeStateRef.current) : null);
    setPhaseBoth(usingCube && settings.requireScrambleMatch ? 'scrambling' : 'ready');
  }, [settings.randomStateScramble, settings.requireScrambleMatch, usingCube, setPhaseBoth]);

  // holds the latest cube state for callbacks that must not depend on renders
  const cubeStateRef = useRef<CubeState>(cloneState(SOLVED_STATE));

  useEffect(() => {
    void newScramble();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRecent = useCallback(async () => {
    const rows = await db.solves.where('sessionId').equals(sessionId).reverse().sortBy('date');
    setRecent(rows.slice(0, 60));
  }, [sessionId]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent, revision]);

  /* ---------- clock ---------- */
  const tick = useCallback(() => {
    setDisplay(performance.now() - startRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopRaf = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  };

  /** End the solve, taking the final time from the last move recorded. */
  const finishFromMoves = useCallback((penalty: Penalty = 'none') => {
    const norm = normalizeTimestamps(movesRef.current);
    const t = norm[norm.length - 1]?.t ?? performance.now() - startRef.current;
    void finishSolveRef.current?.(t, movesRef.current, 'smartcube', penalty);
  }, []);

  const finishSolveRef = useRef<
    ((t: number, m: LiveMove[], s: 'smartcube' | 'manual', p: Penalty) => Promise<void>) | null
  >(null);

  const finishSolve = useCallback(
    async (timeMs: number, moves: LiveMove[], source: 'smartcube' | 'manual', penalty: Penalty = 'none') => {
      stopRaf();
      setDisplay(timeMs);
      setStuck(false);
      setPhaseBoth('done');
      const solve: Solve = {
        sessionId,
        date: Date.now(),
        scramble: scrambleRef.current.join(' '),
        timeMs,
        penalty,
        source,
        moves: source === 'smartcube' ? normalizeTimestamps(moves) : [],
      };
      const id = await db.solves.add(solve);
      setLastSolve({ ...solve, id });
      bump();
      void newScramble();
    },
    [sessionId, bump, newScramble, setPhaseBoth],
  );

  /* ---------- input from the cube ---------- */
  useCubeInput(
    {
      onState: (s, fromCube) => {
        cubeStateRef.current = s;
        setCubeState(s);
        // A MOVE is followed by its own state event; letting that through would
        // cancel the turn before a single frame of it had been drawn.
        if (fromCube) live.jump(s);
        // The state can change without any move (the cube re-sends facelets
        // after a sync) — refresh the progress to match.
        if (phaseRef.current === 'scrambling' && trackerRef.current) {
          setProgress(trackerRef.current.update(s));
        }
        // Second safety net for stopping the clock. If the final move event is
        // missed but the cube reports a solved state on its own, stop anyway —
        // the time still comes from the last move received, so it stays exact.
        if (phaseRef.current === 'running' && isSolved(s) && movesRef.current.length > 2) {
          finishFromMoves();
        }
      },
      onMove: (m, state) => {
        live.turn(m.move, state);
        const p = phaseRef.current;

        if (p === 'scrambling') {
          const tracker = trackerRef.current;
          if (!tracker) return;
          const next = tracker.update(state, m.move);
          setProgress(next);
          if (next.status === 'complete') {
            setLastSolve(null);
            setDisplay(0);
            setPhaseBoth(settings.useInspection ? 'inspecting' : 'ready');
            if (settings.useInspection) setInspectLeft(settings.inspectionSeconds * 1000);
          }
          return;
        }

        if (p === 'ready' || p === 'inspecting') {
          movesRef.current = [m];
          setMoveCount(1);
          startRef.current = performance.now();
          lastMoveAtRef.current = performance.now();
          setLastSolve(null);
          setPhaseBoth('running');
          setInspectLeft(0);
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        if (p === 'running') {
          movesRef.current.push(m);
          setMoveCount(movesRef.current.length);
          lastMoveAtRef.current = performance.now();
          setStuck(false);
          if (isSolved(state)) finishFromMoves();
        }
      },
    },
    settings.keyboardCube,
  );

  /**
   * Connecting or disconnecting the cube mid-session switches the timing mode:
   * with a cube it becomes scramble-guided, without one it falls back to space.
   */
  useEffect(() => {
    const p = phaseRef.current;
    if (p === 'running' || p === 'holding' || p === 'armed') return;
    if (usingCube && settings.requireScrambleMatch) {
      const tracker = new ScrambleTracker(scrambleRef.current);
      trackerRef.current = tracker;
      const next = tracker.update(cubeStateRef.current);
      setProgress(next);
      setPhaseBoth(next.status === 'complete' ? 'ready' : 'scrambling');
    } else {
      trackerRef.current = null;
      setProgress(null);
      setPhaseBoth('ready');
    }
  }, [usingCube, settings.requireScrambleMatch, setPhaseBoth]);

  // Inspection countdown
  useEffect(() => {
    if (phase !== 'inspecting') return;
    const started = performance.now();
    const total = settings.inspectionSeconds * 1000;
    const id = setInterval(() => setInspectLeft(Math.max(0, total - (performance.now() - started))), 50);
    return () => clearInterval(id);
  }, [phase, settings.inspectionSeconds]);

  /* ---------- spacebar timing ---------- */
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const p = phaseRef.current;
      if (p === 'running' && !usingCube) {
        e.preventDefault();
        stopRaf();
        void finishSolve(performance.now() - startRef.current, [], 'manual');
        return;
      }
      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      if (usingCube) return; // with a real cube the first move starts it
      if (p !== 'running') {
        setPhaseBoth('holding');
        holdRef.current = window.setTimeout(() => setPhaseBoth('armed'), HOLD_MS);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (isTyping(e) || e.code !== 'Space') return;
      e.preventDefault();
      if (holdRef.current) {
        clearTimeout(holdRef.current);
        holdRef.current = null;
      }
      const p = phaseRef.current;
      if (p === 'armed') {
        startRef.current = performance.now();
        setLastSolve(null);
        setPhaseBoth('running');
        rafRef.current = requestAnimationFrame(tick);
      } else if (p === 'holding') {
        setPhaseBoth('ready');
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [usingCube, tick, finishSolve, setPhaseBoth]);

  useEffect(() => {
    finishSolveRef.current = finishSolve;
  }, [finishSolve]);

  /**
   * Hands still for a few seconds usually means something went wrong rather
   * than a long think, so offer a way out. This is a screen timer and nothing
   * more — it must never touch the cube, however often it ticks.
   */
  useEffect(() => {
    if (phase !== 'running' || !usingCube) {
      setStuck(false);
      return;
    }
    const id = setInterval(() => setStuck(performance.now() - lastMoveAtRef.current > STUCK_MS), 300);
    return () => clearInterval(id);
  }, [phase, usingCube]);

  /**
   * Third safety net for stopping the clock: while running, a pause in turning
   * asks the cube whether it is solved. This catches a dropped final move
   * without ever stopping wrongly, because it only stops when the cube says so.
   *
   * Every one of those asks is a write to the cube over bluetooth, and writing
   * to it several times a second is a good way to lose the link — so the rate
   * limit lives in cubeLink.pollState(), which refuses to ask too often and
   * gives up after a few tries until the next move.
   */
  useEffect(() => {
    if (phase !== 'running' || cubeStatus !== 'connected') return;
    const id = setInterval(() => {
      // Only ask after the hands have stopped for a moment — mid-turn there is
      // no need, and it keeps the bluetooth link clear during the solve.
      if (performance.now() - lastMoveAtRef.current > 1000) void cubeLink.pollState();
    }, 500);
    return () => clearInterval(id);
  }, [phase, cubeStatus]);

  useEffect(() => () => stopRaf(), []);

  /* ---------- derived ---------- */
  const analysis = useMemo(() => (lastSolve ? analyzeSolveRecord(lastSolve, settings) : null), [lastSolve, settings]);
  const times = useMemo(() => recent.map(effectiveTime), [recent]);
  const finiteTimes = times.filter(isFinite);
  const ao5 = averageOf(times.slice(0, 5));
  const ao12 = averageOf(times.slice(0, 12));
  const best = finiteTimes.length ? Math.min(...finiteTimes) : NaN;

  /**
   * Only say "cube not solved" when the app is genuinely stuck: off track and
   * unable to work out what was turned, so it has no fix to offer.
   */
  const notReady =
    usingCube &&
    phase === 'scrambling' &&
    progress?.status === 'off-track' &&
    progress.fix.length === 0 &&
    !isAtStart(cubeState);

  const applyPenalty = async (solve: Solve, penalty: Penalty) => {
    if (!solve.id) return;
    await db.solves.update(solve.id, { penalty });
    setLastSolve({ ...solve, penalty });
    bump();
  };

  const deleteSolve = async (solve: Solve) => {
    if (!solve.id) return;
    await db.solves.delete(solve.id);
    if (lastSolve?.id === solve.id) setLastSolve(null);
    bump();
  };

  /* ---------- running: nothing on screen but the clock and the cube ---------- */
  if (phase === 'running') {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6">
        {/* Slow mode counts moves instead of seconds. The clock still runs and
            is still recorded — it is just not the thing to be looking at when
            the point of the solve is to find a shorter solution. */}
        <div className="tnum font-mono text-[clamp(3.5rem,14vw,10rem)] font-semibold leading-none text-ink-100">
          {slow ? moveCount : formatTime(display)}
        </div>
        {slow && <p className="-mt-4 text-sm text-ink-500">moves</p>}
        {usingCube && (
          // The on-screen cube follows the real one during the solve — which is
          // also how a dropped bluetooth move shows up, as the two diverge.
          <CubeView state={live.shown} animate={live.animate} size={150} quaternion={quaternion} interactive={false} />
        )}
        {stuck ? (
          <button className="btn btn-danger pop-in" onClick={() => finishFromMoves('DNF')}>
            Abort as DNF
          </button>
        ) : usingCube ? null : (
          <p className="text-sm text-ink-500">Press any key to stop.</p>
        )}
      </div>
    );
  }

  // Once the cube is scrambled there is nothing left to read, so it goes away.
  // Without scramble tracking the app cannot know when that moment is, so it stays.
  const scrambleVisible =
    !usingCube || !settings.requireScrambleMatch || phase === 'scrambling' || phase === 'done';
  const timerTone =
    phase === 'inspecting' ? 'text-warn' : lastSolve ? 'text-ink-100' : 'text-ink-600';

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-h-0 flex-col gap-4">
        {scrambleVisible && (
          <section className="panel px-4 py-3.5 sm:px-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <ScrambleGuide moves={scramble} progress={phase === 'scrambling' ? progress : null} />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <div className="flex gap-1">
                  {(['speed', 'slow'] as const).map((m) => (
                    <button
                      key={m}
                      className={`btn btn-ghost !px-2 !py-0.5 !text-[12px] ${
                        settings.timerMode === m ? '!text-cube-blue' : '!text-ink-500'
                      }`}
                      onClick={() => void updateSettings({ timerMode: m })}
                      title={
                        m === 'slow'
                          ? 'Solve deliberately: the screen counts moves, and the review talks about efficiency'
                          : 'Ordinary timed solving'
                      }
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <button className="btn btn-ghost !py-1 !text-[13px]" onClick={() => void newScramble()}>
                  New
                </button>
                {settings.randomStateScramble && scrambleSource === 'random-move' && (
                  <span
                    className="text-[11px] text-warn"
                    title="The random-state generator failed to load; falling back to random moves."
                  >
                    random-move
                  </span>
                )}
              </div>
            </div>
            {notReady && (
              <button
                className="mt-2 text-[12px] text-warn underline underline-offset-2"
                onClick={() => setShowSync((v) => !v)}
              >
                Cube is not solved — solve it, or sync if the app has it wrong
              </button>
            )}
            {showSync && (
              <div className="mt-3 border-t border-ink-800 pt-3">
                <CubeSync compact />
              </div>
            )}
          </section>
        )}

        {/* The clock and the cube, with nothing competing for attention */}
        <section className="panel flex flex-col items-center gap-4 px-4 py-6 sm:py-8">
          <div className={`tnum font-mono text-[clamp(3rem,11vw,6.5rem)] font-semibold leading-none ${timerTone}`}>
            {phase === 'inspecting'
              ? (inspectLeft / 1000).toFixed(1)
              : lastSolve?.penalty === 'DNF'
                ? 'DNF'
                : slow && lastSolve && analysis
                  ? analysis.totalMoves
                  : formatTime(display)}
            {lastSolve?.penalty === '+2' && <span className="text-bad">+2</span>}
          </div>
          {slow && lastSolve && analysis && lastSolve.penalty !== 'DNF' && (
            <p className="-mt-3 text-[13px] text-ink-500">
              moves · {formatTime(display)}
            </p>
          )}

          <CubeView
            state={usingCube && phase === 'scrambling' ? live.shown : targetState}
            animate={usingCube && phase === 'scrambling' ? live.animate : null}
            size={190}
            quaternion={usingCube && phase === 'scrambling' ? quaternion : null}
          />

          {phase === 'ready' && usingCube && (
            <p className="armed text-sm font-semibold text-good">Turn to start</p>
          )}
          {phase === 'armed' && <p className="text-sm font-semibold text-good">Release to start</p>}
          {phase === 'holding' && <p className="text-sm font-semibold text-warn">Keep holding…</p>}
          {!usingCube && phase !== 'armed' && phase !== 'holding' && (
            <p className="text-[13px] text-ink-500">Hold space to start, or connect a smart cube.</p>
          )}
          {settings.keyboardCube && phase === 'scrambling' && (
            <button
              className="btn btn-ghost !px-2 !py-0.5 !text-[12px]"
              onClick={() => virtualCube.setState(applyMoves(SOLVED_STATE, scramble))}
            >
              Apply the scramble to the virtual cube
            </button>
          )}
        </section>

        {/* Feedback on the solve just finished, until the next one starts */}
        {lastSolve && (
          <section className="panel px-4 py-4 sm:px-5">
            <PostSolve
              analysis={analysis}
              focus={settings.timerMode}
              onOpenReplay={lastSolve.id ? () => onOpenSolve(lastSolve.id!) : undefined}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-800 pt-3">
              <button
                className={`btn !py-1 !text-[13px] ${lastSolve.penalty === '+2' ? '!border-warn !text-warn' : ''}`}
                onClick={() => void applyPenalty(lastSolve, lastSolve.penalty === '+2' ? 'none' : '+2')}
              >
                +2
              </button>
              <button
                className={`btn !py-1 !text-[13px] ${lastSolve.penalty === 'DNF' ? '!border-bad !text-bad' : ''}`}
                onClick={() => void applyPenalty(lastSolve, lastSolve.penalty === 'DNF' ? 'none' : 'DNF')}
              >
                DNF
              </button>
              <button className="btn btn-danger !py-1 !text-[13px]" onClick={() => void deleteSolve(lastSolve)}>
                Delete
              </button>
              <dl className="ml-auto flex gap-5">
                <Stat label="ao5" value={formatTime(ao5)} />
                <Stat label="ao12" value={formatTime(ao12)} />
                <Stat label="best" value={formatTime(best)} />
              </dl>
            </div>
          </section>
        )}

        {!lastSolve && finiteTimes.length > 0 && (
          <dl className="flex justify-center gap-8">
            <Stat label="ao5" value={formatTime(ao5)} />
            <Stat label="ao12" value={formatTime(ao12)} />
            <Stat label="best" value={formatTime(best)} />
          </dl>
        )}
      </div>

      <section className="panel flex max-h-[60vh] flex-col overflow-hidden xl:max-h-[calc(100vh-8.5rem)]">
        <header className="flex items-baseline justify-between border-b border-ink-700 px-4 py-3">
          <h2 className="text-sm font-semibold">Session solves</h2>
          <span className="tnum text-[13px] text-ink-400">{recent.length}</span>
        </header>
        <div className="overflow-y-auto">
          {recent.length === 0 && (
            <p className="px-4 py-6 text-sm text-ink-400">No solves yet.</p>
          )}
          {recent.map((s, i) => (
            <SolveRow key={s.id} solve={s} index={recent.length - i} onOpen={() => s.id && onOpenSolve(s.id)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-ink-500">{label}</dt>
      <dd className="tnum font-mono text-[15px] text-ink-200">{value}</dd>
    </div>
  );
}

function SolveRow({ solve, index, onOpen }: { solve: Solve; index: number; onOpen: () => void }) {
  const { settings } = useApp();
  const a = useMemo(() => analyzeSolveRecord(solve, settings), [solve, settings]);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 border-b border-ink-800 px-4 py-2.5 text-left hover:bg-ink-800"
    >
      <span className="tnum w-6 shrink-0 text-[13px] text-ink-500">{index}</span>
      <span className="tnum w-16 shrink-0 font-mono text-[15px]">
        {solve.penalty === 'DNF' ? <span className="text-bad">DNF</span> : formatTime(effectiveTime(solve))}
      </span>
      <span className="min-w-0 flex-1">
        {a ? (
          <StepRibbon steps={a.steps} totalMs={a.totalMs} height={6} />
        ) : (
          <span className="text-[12px] text-ink-500">hand timed</span>
        )}
      </span>
    </button>
  );
}
