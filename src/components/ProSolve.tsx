/**
 * Following a real solve, on your own cube, at your own speed.
 *
 * The thing this replaces is watching an example solve on video: pause,
 * rewind, work out what just happened, lose your place, start again. The moves
 * are known, so the app can simply hand them to you one step at a time and
 * watch your cube to see that you have done them — which is the same guidance
 * the scramble already gets, pointed at somebody else's solution.
 *
 * Their step names are used, not the app's step detector. "Lsquare" and "Rpair"
 * are how the person who did it thought about it, and that is the part worth
 * borrowing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PRO_SOLVES, type ProSolve as Solve } from '../data/proSolves';
import { parseAlg, formatAlg } from '../cube/alg';
import { applyMoves, SOLVED_STATE, cloneState, isSolved, type CubeState } from '../cube/cube';
import { ScrambleTracker, type ScrambleProgress } from '../analysis/scrambleGuide';
import { useCubeInput } from '../smartcube/useCubeInput';
import { cubeLink } from '../smartcube/connection';
import { useTurnAnimation } from './useTurnAnimation';
import { formatSeconds } from '../analysis/stats';
import CubeView from './CubeView';
import ScrambleGuide from './ScrambleGuide';

type Phase = 'pick' | 'scrambling' | 'following' | 'done';

const SOURCE = (id: number) => `http://www.cubesolv.es/solve/${id}`;

export default function ProSolve({ usingCube, keyboard }: { usingCube: boolean; keyboard: boolean }) {
  const [solve, setSolve] = useState<Solve | null>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [progress, setProgress] = useState<ScrambleProgress | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [cubeState, setCubeState] = useState<CubeState>(() => cloneState(SOLVED_STATE));
  const [who, setWho] = useState<string>('all');
  const live = useTurnAnimation();

  const phaseRef = useRef<Phase>('pick');
  const trackerRef = useRef<ScrambleTracker | null>(null);
  const cubeRef = useRef<CubeState>(cloneState(SOLVED_STATE));
  const stepRef = useRef(0);
  const solveRef = useRef<Solve | null>(null);
  const startedRef = useRef(0);
  const [tookMs, setTookMs] = useState(0);

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const solvers = useMemo(() => [...new Set(PRO_SOLVES.map((s) => s.solver))].sort(), []);
  const shown = useMemo(
    () => PRO_SOLVES.filter((s) => who === 'all' || s.solver === who),
    [who],
  );

  /** Their solution, step by step, with the moves parsed once. */
  const steps = useMemo(
    () => (solve ? solve.steps.map((s) => ({ label: s.label, moves: parseAlg(s.moves) })) : []),
    [solve],
  );

  /** The cube as it stands at the start of each step, for drawing it. */
  const atStep = useMemo(() => {
    if (!solve) return [];
    const out: CubeState[] = [];
    let s = applyMoves(SOLVED_STATE, parseAlg(solve.scramble));
    for (const st of steps) {
      out.push(s);
      s = applyMoves(s, st.moves);
    }
    out.push(s);
    return out;
  }, [solve, steps]);

  /**
   * Start on a solve: apply their scramble first.
   *
   * Measured from wherever your cube is now, not from solved — after following
   * one solve the cube is solved, but after abandoning one halfway it is not,
   * and a guide that insists on starting from solved would be unfollowable.
   */
  const begin = useCallback((s: Solve) => {
    solveRef.current = s;
    setSolve(s);
    setStepIndex(0);
    stepRef.current = 0;
    const tracker = new ScrambleTracker(parseAlg(s.scramble), cloneState(cubeRef.current));
    trackerRef.current = tracker;
    setProgress(tracker.update(cubeRef.current));
    setPhaseBoth('scrambling');
  }, []);

  /** Move on to their next step, or finish. */
  const advance = useCallback(() => {
    const s = solveRef.current;
    if (!s) return;
    const next = stepRef.current + 1;
    if (next >= s.steps.length) {
      setTookMs(performance.now() - startedRef.current);
      setPhaseBoth('done');
      return;
    }
    stepRef.current = next;
    setStepIndex(next);
    const moves = parseAlg(s.steps[next].moves);
    const tracker = new ScrambleTracker(moves, cloneState(cubeRef.current));
    trackerRef.current = tracker;
    setProgress(tracker.update(cubeRef.current));
  }, []);

  /** The scramble is on; hand over the first step of their solution. */
  const startFollowing = useCallback(() => {
    const s = solveRef.current;
    if (!s) return;
    startedRef.current = performance.now();
    stepRef.current = 0;
    setStepIndex(0);
    const tracker = new ScrambleTracker(parseAlg(s.steps[0].moves), cloneState(cubeRef.current));
    trackerRef.current = tracker;
    setProgress(tracker.update(cubeRef.current));
    setPhaseBoth('following');
  }, []);

  // Turning D four times mid-follow would reset the cube and lose the place
  useEffect(() => {
    if (phase !== 'scrambling' && phase !== 'following') return;
    return cubeLink.holdResetGesture();
  }, [phase]);

  useCubeInput(
    {
      onState: (s, fromCube) => {
        cubeRef.current = s;
        setCubeState(s);
        if (fromCube) live.jump(s);
        const tracker = trackerRef.current;
        if (!tracker) return;
        const p = phaseRef.current;
        if (p !== 'scrambling' && p !== 'following') return;
        const next = tracker.update(s);
        setProgress(next);
        if (next.status === 'complete') {
          if (p === 'scrambling') startFollowing();
          else advance();
        }
      },
      onMove: (m, state) => {
        live.turn(m.move, state);
        cubeRef.current = state;
        setCubeState(state);
        const tracker = trackerRef.current;
        if (!tracker) return;
        const p = phaseRef.current;
        if (p !== 'scrambling' && p !== 'following') return;
        const next = tracker.update(state, m.move);
        setProgress(next);
        if (next.status === 'complete') {
          if (p === 'scrambling') startFollowing();
          else advance();
        }
      },
    },
    keyboard,
  );

  const current = steps[stepIndex];
  const totalMoves = useMemo(() => steps.reduce((a, s) => a + s.moves.length, 0), [steps]);

  if (phase === 'pick' || !solve) {
    return (
      <section className="panel px-4 py-4 sm:px-5">
        <h2 className="text-base font-semibold">Solve like a pro</h2>
        <p className="mt-1 max-w-[62ch] text-[13px] text-ink-400">
          Their scramble, their solution, your cube. Pick one and the app hands you a step at a time and watches
          that you have done it — instead of pausing a video and working out what just happened.
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {['all', ...solvers].map((s) => (
            <button
              key={s}
              onClick={() => setWho(s)}
              className={
                'rounded-full border px-2.5 py-1 text-[13px] transition-colors ' +
                (who === s
                  ? 'border-cube-blue bg-[color-mix(in_srgb,var(--color-cube-blue)_18%,transparent)] text-ink-100'
                  : 'border-ink-600 text-ink-300 hover:bg-ink-800')
              }
            >
              {s === 'all' ? `Everyone (${PRO_SOLVES.length})` : s}
            </button>
          ))}
        </div>

        <div className="mt-3 max-h-[46vh] overflow-y-auto rounded-lg border border-ink-800">
          {shown.map((s) => (
            <button
              key={s.id}
              onClick={() => begin(s)}
              className="flex w-full items-baseline gap-3 border-b border-ink-800 px-3 py-2 text-left hover:bg-ink-800"
            >
              <span className="tnum w-14 shrink-0 font-mono text-[15px] text-ink-100">
                {formatSeconds(s.timeMs)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink-200">{s.solver}</span>
                <span className="block truncate text-[12px] text-ink-500">
                  {s.at} · {s.date}
                </span>
              </span>
              <span className="tnum shrink-0 text-[12px] text-ink-500">
                {s.steps.reduce((a, x) => a + x.moves.split(' ').length, 0)} moves
              </span>
            </button>
          ))}
        </div>

        {!usingCube && (
          <p className="mt-3 text-[13px] text-warn">
            Connect a cube to be guided through one. Without it you can still read the solutions.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="panel flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{solve.solver}</h2>
          <p className="text-[12px] text-ink-500">
            {formatSeconds(solve.timeMs)}s · {totalMoves} moves · {solve.at}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            className="btn btn-ghost !py-1 !text-[12px]"
            href={SOURCE(solve.id)}
            target="_blank"
            rel="noreferrer"
            title="The reconstruction this came from"
          >
            Source
          </a>
          <button
            className="btn !py-1 !text-[13px]"
            onClick={() => {
              setSolve(null);
              solveRef.current = null;
              trackerRef.current = null;
              setPhaseBoth('pick');
            }}
          >
            Back
          </button>
        </div>
      </div>

      {phase === 'scrambling' && (
        <>
          <p className="text-[13px] text-cube-blue">Their scramble — apply it to your cube</p>
          <ScrambleGuide moves={parseAlg(solve.scramble)} progress={progress} />
        </>
      )}

      {phase === 'following' && current && (
        <>
          {/* Their words for the step, not the app's. How the person who did it
              thought about it is the part worth borrowing. */}
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[15px] font-semibold text-cube-blue">{current.label}</p>
            <p className="tnum text-[12px] text-ink-500">
              step {stepIndex + 1} of {steps.length}
            </p>
          </div>
          <ScrambleGuide moves={current.moves} progress={progress} />
        </>
      )}

      {phase === 'done' && (
        <div className="flex flex-col gap-2">
          <p className="text-[15px] font-semibold text-good">
            That was {solve.solver}&rsquo;s solve, all {totalMoves} moves of it.
          </p>
          <p className="text-[13px] text-ink-400">
            You took {formatSeconds(tookMs)}s following it; they did it in {formatSeconds(solve.timeMs)}s.
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {steps.map((s, i) => (
              <li key={i} className="flex items-baseline gap-2 text-[13px]">
                <span className="w-24 shrink-0 text-ink-400">{s.label}</span>
                <span className="font-mono text-ink-200">{formatAlg(s.moves)}</span>
                <span className="tnum ml-auto text-[12px] text-ink-500">{s.moves.length}</span>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex gap-2">
            <button className="btn btn-primary !py-1 !text-[13px]" onClick={() => begin(solve)}>
              Again
            </button>
            <button
              className="btn !py-1 !text-[13px]"
              onClick={() => {
                setSolve(null);
                setPhaseBoth('pick');
              }}
            >
              Another solve
            </button>
          </div>
        </div>
      )}

      {usingCube ? (
        <CubeView
          state={live.animate ? live.shown : cubeState}
          animate={live.animate}
          size={170}
          className="self-center"
        />
      ) : (
        <CubeView state={atStep[stepIndex] ?? SOLVED_STATE} size={170} className="self-center" />
      )}

      {phase === 'following' && isSolved(cubeState) && <p className="text-[12px] text-good">Solved.</p>}
    </section>
  );
}
