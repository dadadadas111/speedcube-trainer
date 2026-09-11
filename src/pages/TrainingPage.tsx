/**
 * Training: finding the shortest solution, and being told whether you did.
 *
 * The idea is borrowed from roux-trainers — a case, a think, and the optimal
 * answer to compare against. What is added here is the cube: instead of
 * deciding for yourself whether what you found matches what the solver says,
 * the app watches what you actually turn and answers that question for you.
 * Knowing your solution was three moves longer than the best one is the whole
 * point of the exercise, and it is the part you cannot check by eye.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/app';
import { SOLVED_STATE, applyMoves, cloneState, isSolved, groupSolved, PIECES, type CubeState } from '../cube/cube';
import { ROTATIONS } from '../cube/geometry';
import { ROTATIONS_WITH_AUF, rouxEdgesOriented } from '../analysis/method';
import { cleanMoveStream } from '../cube/moveStream';
import { generateScramble } from '../cube/scramble';
import { formatAlg } from '../cube/alg';
import { formatSeconds } from '../analysis/stats';
import { FB_METRIC, solveFirstBlock, type FbResult } from '../analysis/solver/firstBlock';
import { randomLseCase, solveLse } from '../analysis/solver/lse';
import { ScrambleTracker, type ScrambleProgress } from '../analysis/scrambleGuide';
import { useCubeInput } from '../smartcube/useCubeInput';
import { cubeLink, type LiveMove } from '../smartcube/connection';
import { useTurnAnimation } from '../components/useTurnAnimation';
import CubeView from '../components/CubeView';
import ScrambleGuide from '../components/ScrambleGuide';

type Mode = 'fb' | 'eolr' | '4c';
type Phase = 'idle' | 'setup' | 'armed' | 'running';

const MODES: { id: Mode; name: string; blurb: string }[] = [
  { id: 'fb', name: 'First block', blurb: 'Shortest 1x2x3 from a full scramble' },
  { id: 'eolr', name: 'EOLR', blurb: 'Orient the six edges and place UL/UR' },
  { id: '4c', name: 'LSE 4c', blurb: 'Finish the M slice' },
];

interface Case {
  /** Turns that put the cube into the case, from solved */
  setup: string[];
  /** Fewest moves to finish, in STM */
  best: number;
  /** A few of the shortest solutions */
  solutions: string[][];
}

interface Attempt {
  mode: Mode;
  /** The solution you found, after cancellations and slice merges */
  used: string[];
  best: number;
  ms: number;
  thinkMs: number;
}

/** Has the goal been reached? Answered on the cube itself, at any angle. */
function goalReached(mode: Mode, state: CubeState): boolean {
  if (mode === 'fb') return ROTATIONS.some((r) => groupSolved(state, r, PIECES.FB));
  if (mode === '4c') return isSolved(state);
  return ROTATIONS_WITH_AUF.some((r) => rouxEdgesOriented(state, r) && groupSolved(state, r, PIECES.UL_UR));
}

export default function TrainingPage() {
  const { settings, cubeStatus } = useApp();
  const usingCube = cubeStatus === 'connected' || settings.keyboardCube;

  const [mode, setMode] = useState<Mode>('fb');
  const [current, setCurrent] = useState<Case | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<ScrambleProgress | null>(null);
  const [reveal, setReveal] = useState(false);
  const [last, setLast] = useState<Attempt | null>(null);
  const [history, setHistory] = useState<Attempt[]>([]);
  const [thinking, setThinking] = useState(false);
  const live = useTurnAnimation();

  const phaseRef = useRef<Phase>('idle');
  const caseRef = useRef<Case | null>(null);
  const trackerRef = useRef<ScrambleTracker | null>(null);
  const movesRef = useRef<LiveMove[]>([]);
  const armedAtRef = useRef(0);
  const startRef = useRef(0);
  const cubeRef = useRef<CubeState>(cloneState(SOLVED_STATE));

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  /** The cube as the case leaves it, for showing what you are looking at. */
  const caseState = useMemo(
    () => (current ? applyMoves(SOLVED_STATE, current.setup) : cloneState(SOLVED_STATE)),
    [current],
  );

  const deal = useCallback(async () => {
    setReveal(false);
    let next: Case;
    if (mode === 'fb') {
      const { moves } = await generateScramble(settings.randomStateScramble);
      const r: FbResult = solveFirstBlock(moves, 5);
      next = { setup: moves, best: r.length, solutions: r.solutions };
    } else {
      const goal = mode === 'eolr' ? 'eolr' : 'solved';
      const c = randomLseCase(goal);
      const sol = solveLse(c.setup, goal);
      next = { setup: c.setup, best: c.best, solutions: sol ? [sol.moves] : [] };
    }
    caseRef.current = next;
    setCurrent(next);
    // With no cube there is nothing to turn the case into and nothing to time,
    // so the case is simply there to look at
    setPhaseBoth(usingCube ? 'setup' : 'armed');
  }, [mode, settings.randomStateScramble, usingCube]);

  // Switching mode puts everything back, rather than carrying a case across
  useEffect(() => {
    setPhaseBoth('idle');
    setCurrent(null);
    caseRef.current = null;
    setProgress(null);
    setLast(null);
    setHistory([]);
  }, [mode]);

  // Rebuild the guide whenever a case arrives
  useEffect(() => {
    if (!current) return;
    const tracker = new ScrambleTracker(current.setup);
    trackerRef.current = tracker;
    setProgress(tracker.update(cubeRef.current));
  }, [current]);

  // A resync gesture mid-attempt would wipe the attempt
  useEffect(() => {
    if (phase !== 'armed' && phase !== 'running') return;
    return cubeLink.holdResetGesture();
  }, [phase]);

  // While you are looking at the case, count the thinking time
  useEffect(() => {
    if (phase !== 'armed') {
      setThinking(false);
      return;
    }
    setThinking(true);
    const id = setInterval(() => setThinking(true), 250);
    return () => clearInterval(id);
  }, [phase]);

  const arm = useCallback(() => {
    armedAtRef.current = performance.now();
    movesRef.current = [];
    setPhaseBoth('armed');
  }, []);

  const finish = useCallback(
    (state: CubeState) => {
      const c = caseRef.current;
      if (!c) return;
      const used = cleanMoveStream(
        movesRef.current.map((m, i) => ({ move: m.move, t: (m.cubeTs ?? m.localTs) - startRef.current + i * 0 })),
      ).map((m) => m.move);
      const attempt: Attempt = {
        mode,
        used,
        best: c.best,
        ms: performance.now() - startRef.current,
        thinkMs: Math.max(0, startRef.current - armedAtRef.current),
      };
      setLast(attempt);
      setHistory((h) => [...h, attempt]);
      setReveal(true);
      void state;
      void deal();
    },
    [mode, deal],
  );

  useCubeInput(
    {
      onState: (s, fromCube) => {
        cubeRef.current = s;
        if (fromCube) live.jump(s);
        if (phaseRef.current !== 'setup') return;
        const tracker = trackerRef.current;
        if (!tracker) return;
        const next = tracker.update(s);
        setProgress(next);
        if (next.status === 'complete') arm();
      },
      onMove: (m, state) => {
        live.turn(m.move, state);
        cubeRef.current = state;
        const p = phaseRef.current;

        if (p === 'setup') {
          const tracker = trackerRef.current;
          if (!tracker) return;
          const next = tracker.update(state, m.move);
          setProgress(next);
          if (next.status === 'complete') arm();
          return;
        }
        if (p !== 'armed' && p !== 'running') return;

        if (p === 'armed') {
          startRef.current = performance.now();
          setPhaseBoth('running');
        }
        movesRef.current.push(m);
        if (goalReached(mode, state)) finish(state);
      },
    },
    settings.keyboardCube,
  );

  const summary = useMemo(() => {
    const mine = history.filter((h) => h.mode === mode);
    if (!mine.length) return null;
    const over = mine.map((h) => h.used.length - h.best);
    const optimal = over.filter((o) => o <= 0).length;
    return {
      count: mine.length,
      optimal,
      meanOver: over.reduce((a, b) => a + b, 0) / mine.length,
      meanMs: mine.reduce((a, b) => a + b.ms, 0) / mine.length,
    };
  }, [history, mode]);

  return (
    <div className="flex flex-col gap-4">
      <section className="panel px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {MODES.map((m) => (
              <button
                key={m.id}
                className={
                  'rounded-full border px-3 py-1 text-[13px] transition-colors ' +
                  (mode === m.id
                    ? 'border-cube-blue bg-[color-mix(in_srgb,var(--color-cube-blue)_18%,transparent)] text-ink-100'
                    : 'border-ink-600 text-ink-300 hover:bg-ink-800')
                }
                onClick={() => setMode(m.id)}
                title={m.blurb}
              >
                {m.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {phase === 'idle' ? (
              <button className="btn btn-primary !py-1 !text-[13px]" onClick={() => void deal()}>
                Start
              </button>
            ) : (
              <>
                <button className="btn !py-1 !text-[13px]" onClick={() => void deal()}>
                  Skip
                </button>
                <button
                  className="btn !py-1 !text-[13px]"
                  onClick={() => {
                    setPhaseBoth('idle');
                    setCurrent(null);
                    caseRef.current = null;
                  }}
                >
                  Stop
                </button>
              </>
            )}
          </div>
        </div>
        <p className="mt-2 text-[13px] text-ink-500">{MODES.find((m) => m.id === mode)!.blurb}</p>
      </section>

      {!usingCube && (
        <section className="panel px-4 py-4 sm:px-5">
          <p className="max-w-[60ch] text-sm text-ink-400">
            Without a cube the app can still deal cases and show you the shortest solution, but it cannot tell you
            whether the one you found matches. Connect a cube from the top bar, or switch on the keyboard cube in
            Settings.
          </p>
        </section>
      )}

      {current && (
        <section className="panel flex flex-col items-center gap-4 px-4 py-5 sm:px-5">
          {phase === 'setup' && (
            <div className="w-full">
              <p className="mb-2 text-center text-[13px] text-ink-500">
                {usingCube ? 'Turn this into your cube' : 'Apply this to your cube'}
              </p>
              <ScrambleGuide moves={current.setup} progress={usingCube ? progress : null} />
            </div>
          )}

          {(phase === 'armed' || phase === 'running') && (
            <p className={`text-lg font-semibold ${phase === 'armed' && usingCube ? 'armed text-good' : 'text-cube-blue'}`}>
              {phase === 'armed' ? 'Find the shortest solution' : 'Going…'}
            </p>
          )}

          <CubeView
            state={phase === 'setup' && usingCube ? (live.animate ? live.shown : cubeRef.current) : caseState}
            animate={phase === 'setup' && usingCube ? live.animate : null}
            size={200}
          />

          {phase !== 'setup' && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-[13px] text-ink-400" title={mode === 'fb' ? FB_METRIC : 'M and U, half turns counted as one'}>
                Fewest moves: <span className="tnum font-mono text-lg text-ink-100">{current.best}</span>
              </p>
              {!reveal ? (
                <button className="btn btn-ghost !py-1 !text-[13px]" onClick={() => setReveal(true)}>
                  Show me
                </button>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  {current.solutions.map((sol, i) => (
                    <p key={i} className="font-mono text-[15px] text-ink-200">
                      {formatAlg(sol)}
                    </p>
                  ))}
                  {current.solutions.length > 1 && (
                    <p className="text-[12px] text-ink-500">{current.solutions.length} of the shortest</p>
                  )}
                </div>
              )}
            </div>
          )}

          {thinking && phase === 'armed' && usingCube && (
            <p className="text-[12px] text-ink-600">The clock starts on your first turn.</p>
          )}
        </section>
      )}

      {last && (
        <section className="panel px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-baseline justify-center gap-x-8 gap-y-2">
            <Figure
              value={String(last.used.length)}
              label="your solution"
              note={last.used.length <= last.best ? 'optimal' : `+${last.used.length - last.best} over`}
              tone={last.used.length <= last.best ? 'good' : 'warn'}
            />
            <Figure value={String(last.best)} label="fewest" />
            <Figure value={`${formatSeconds(last.ms)}s`} label="turning" />
            <Figure value={`${formatSeconds(last.thinkMs)}s`} label="thinking" />
          </div>
          <p className="mt-3 text-center font-mono text-[15px] text-ink-300">{formatAlg(last.used)}</p>
        </section>
      )}

      {summary && summary.count > 1 && (
        <section className="panel px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-baseline justify-center gap-x-8 gap-y-2 text-[13px]">
            <span className="text-ink-400">
              <span className="tnum font-mono text-ink-100">{summary.count}</span> cases
            </span>
            <span className="text-ink-400">
              <span className="tnum font-mono text-good">{summary.optimal}</span> optimal
            </span>
            <span className="text-ink-400">
              <span className="tnum font-mono text-ink-100">+{summary.meanOver.toFixed(1)}</span> moves over on average
            </span>
            <span className="text-ink-400">
              <span className="tnum font-mono text-ink-100">{formatSeconds(summary.meanMs)}s</span> each
            </span>
          </div>
        </section>
      )}
    </div>
  );
}

function Figure({
  value,
  label,
  note,
  tone,
}: {
  value: string;
  label: string;
  note?: string;
  tone?: 'good' | 'warn';
}) {
  return (
    <div className="text-center">
      <p className="tnum font-mono text-2xl font-semibold leading-none text-ink-100">{value}</p>
      <p className="mt-1 text-[12px] text-ink-500">{label}</p>
      {note && <p className={`text-[12px] ${tone === 'good' ? 'text-good' : 'text-warn'}`}>{note}</p>}
    </div>
  );
}
