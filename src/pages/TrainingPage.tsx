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
import {
  SOLVED_STATE,
  applyMoves,
  cloneState,
  groupSolved,
  isSolved,
  piecesByColor,
  PIECES,
  type CubeState,
} from '../cube/cube';
import { ROTATIONS_WITH_AUF, rouxEdgesOriented } from '../analysis/method';
import { cleanMoveStream } from '../cube/moveStream';
import { formatAlg } from '../cube/alg';
import { formatSeconds } from '../analysis/stats';
import { FACE_COLORS } from '../components/palette';
import {
  FB_METRIC,
  analyseBlocksFromStateAsync,
  blockTablesReady,
  prepareBlockTables,
  type BlockChoice,
} from '../analysis/solver/firstBlock';
import { blocksBuilt, type BlockSpec } from '../analysis/solver/blocks';
import { lseSetupFromState, randomLseCase, solveLse } from '../analysis/solver/lse';
import { ScrambleTracker, type ScrambleProgress } from '../analysis/scrambleGuide';
import { sensedMoves, progressInWritten } from '../analysis/followSolve';
import { useCubeInput } from '../smartcube/useCubeInput';
import { cubeLink, type LiveMove } from '../smartcube/connection';
import { useTurnAnimation } from '../components/useTurnAnimation';
import CubeView from '../components/CubeView';
import ProSolve from '../components/ProSolve';
import ScrambleGuide from '../components/ScrambleGuide';

type Mode = 'fb' | 'eolr' | '4c' | 'pro';
/**
 * 'setup' is turning the cube into the case. First block has no such step —
 * you scramble it yourself, which is the only way the mode can run case after
 * case: your cube does not end solved after building a block, so there is no
 * scramble-from-solved left to apply.
 */
type Phase = 'idle' | 'setup' | 'scrambling' | 'armed' | 'running';

const MODES: { id: Mode; name: string; blurb: string }[] = [
  { id: 'fb', name: 'First block', blurb: 'Scramble it yourself, then find the shortest 1x2x3' },
  { id: 'eolr', name: 'EOLR', blurb: 'Orient the six edges and place UL/UR' },
  { id: '4c', name: 'LSE 4c', blurb: 'Finish the M slice' },
  { id: 'pro', name: 'Solve like a pro', blurb: "A real solve, step by step, on your own cube" },
];

interface Case {
  /** The cube the setup starts from — not solved, after the first case */
  from: CubeState;
  /** Turns that put the cube into the case, from wherever it is now */
  setup: string[];
  /** Fewest moves to finish */
  best: number;
  /** A few of the shortest solutions */
  solutions: string[][];
  /** First block only: what every block on this scramble would cost */
  blocks?: BlockChoice[];
}

interface Attempt {
  mode: Mode;
  /** The solution you found, after cancellations and slice merges */
  used: string[];
  best: number;
  ms: number;
  thinkMs: number;
  /** First block only: which block you chose, and what it was worth */
  chose?: BlockSpec;
  choseBest?: number;
}

/** Has the goal been reached? Answered on the cube itself, at any angle. */
function goalReached(mode: Mode, state: CubeState): boolean {
  // Any of the twenty-four blocks counts. Which one you build is your choice,
  // and the whole point of the analyzer is that the choice matters.
  if (mode === 'fb') return blocksBuilt(state).length > 0;
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
  /** Costing all twenty-four blocks takes a moment; say so rather than hanging */
  const [dealing, setDealing] = useState(false);
  /** Something the app cannot do from here, said plainly */
  const [problem, setProblem] = useState<string | null>(null);
  /** How far along the one-off table build is, while it is happening */
  const [prep, setPrep] = useState<{ done: number; total: number } | null>(null);
  /** Turns made since the last analysis, so scrambling can arm itself */
  const scrambleTurnsRef = useRef(0);
  const lastTurnAtRef = useRef(0);
  /** One analysis at a time; the scramble watcher ticks faster than it runs */
  const analysingRef = useRef(false);
  const [cubeState, setCubeState] = useState<CubeState>(() => cloneState(SOLVED_STATE));
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

  /**
   * The setup as the cube will report it.
   *
   * LSE cases are almost entirely M, and a cube has six face sensors and no
   * seventh for the middle layer: a written M arrives as `L' R`, so tracking
   * the written form went off track halfway through every slice and told you
   * to undo a turn it had just asked for. The written form is still what you
   * read; only what is watched for changes.
   */
  const sensed = useMemo(() => (current ? sensedMoves(current.setup) : null), [current]);

  /** The cube as the case leaves it, for showing what you are looking at. */
  const caseState = useMemo(
    () => (current && sensed ? applyMoves(current.from, sensed.moves) : cloneState(SOLVED_STATE)),
    [current, sensed],
  );

  /**
   * Start an attempt: the clock has not run yet, and nothing you turned before
   * now belongs to it.
   *
   * Clearing the move list here is the whole job. First block arms itself from
   * analyseNow rather than from the scramble guide, and that path used to skip
   * this — so every attempt after the first carried the previous one's turns
   * and reported a solution several moves longer than the one you made, which
   * in a mode about counting moves is the only number that matters.
   */
  const arm = useCallback(() => {
    armedAtRef.current = performance.now();
    movesRef.current = [];
    setPhaseBoth('armed');
  }, []);

  /**
   * First block: look at the cube as it is now and cost every block on it.
   * There is no case to deal — your cube IS the case.
   *
   * Twenty-four searches, run a block at a time so the page keeps answering.
   */
  const analyseNow = useCallback(async () => {
    if (analysingRef.current) return;
    analysingRef.current = true;
    setDealing(true);
    try {
      // If your hands move again while this is running, the answer would
      // describe a cube you no longer have. Start over rather than lie.
      const turnsAtStart = scrambleTurnsRef.current;
      const from = cloneState(cubeRef.current);
      const blocks = await analyseBlocksFromStateAsync(from, 2);
      if (scrambleTurnsRef.current !== turnsAtStart) return;
      if (!blocks) {
        setProblem('That cube does not read as a cube. Sync it from the top bar.');
        return;
      }
      setProblem(null);
      const next: Case = { from, setup: [], best: blocks[0].length, solutions: blocks[0].solutions, blocks };
      caseRef.current = next;
      setCurrent(next);
      setReveal(false);
      arm();
    } finally {
      setDealing(false);
      analysingRef.current = false;
    }
  }, [arm]);

  const deal = useCallback(async () => {
    setReveal(false);
    setProblem(null);
    if (mode === 'fb') {
      // Nothing to apply — scramble it however you like and say when
      caseRef.current = null;
      setCurrent(null);
      setPhaseBoth(usingCube ? 'scrambling' : 'armed');
      if (!usingCube) void analyseNow();
      return;
    }
    setDealing(true);
    // Let the spinner paint before the solver takes the thread
    await new Promise((r) => setTimeout(r, 0));
    const goal = mode === 'eolr' ? 'eolr' : 'solved';
    const c = randomLseCase(goal);
    const sol = solveLse(c.setup, goal);
    // From where the cube is, not from solved: after an EOLR attempt the cube
    // is not solved, so a scramble-from-solved would be impossible to follow
    const setup = usingCube ? lseSetupFromState(cubeRef.current, c.key) : c.setup;
    setDealing(false);
    if (!setup) {
      setProblem('Solve the cube first — this mode starts from the last six edges.');
      setPhaseBoth('idle');
      return;
    }
    const next: Case = {
      from: cloneState(cubeRef.current),
      setup,
      best: c.best,
      solutions: sol ? [sol.moves] : [],
    };
    caseRef.current = next;
    setCurrent(next);
    setPhaseBoth(usingCube ? 'setup' : 'armed');
  }, [mode, usingCube, analyseNow]);

  /**
   * Build the block tables as soon as first block is the mode, not at the
   * moment you stop scrambling.
   *
   * They are the same tables every time and cost about a second and a half of
   * solid work to build, so doing it while you are still reading the screen
   * costs nothing, and doing it the instant your hands come off the cube costs
   * exactly the wrong second. Built one block at a time either way, so the page
   * never stops answering.
   */
  useEffect(() => {
    if (mode !== 'fb' || blockTablesReady()) {
      setPrep(null);
      return;
    }
    let live = true;
    setPrep({ done: 0, total: 24 });
    void prepareBlockTables((done, total) => {
      if (live) setPrep({ done, total });
    }).then(() => {
      if (live) setPrep(null);
    });
    return () => {
      live = false;
    };
  }, [mode]);

  // Switching mode puts everything back, rather than carrying a case across
  useEffect(() => {
    setPhaseBoth('idle');
    setCurrent(null);
    caseRef.current = null;
    setProgress(null);
    setLast(null);
    setHistory([]);
  }, [mode]);

  // Rebuild the guide whenever a case arrives. It has to know where the cube
  // was when the case was dealt: after the first case that is not solved, and a
  // guide measuring from solved would never see you arrive.
  useEffect(() => {
    if (!current) return;
    const tracker = new ScrambleTracker(sensed?.moves ?? current.setup, current.from);
    trackerRef.current = tracker;
    setProgress(tracker.update(cubeRef.current));
  }, [current, sensed]);

  /**
   * Scrambling for a first block arms itself once your hands stop.
   *
   * Waiting for a specific scramble to be applied is what made this mode run
   * exactly once — the cube does not end solved, so there was nothing to apply
   * the next one to.
   */
  useEffect(() => {
    if (phase !== 'scrambling') {
      scrambleTurnsRef.current = 0;
      return;
    }
    const id = setInterval(() => {
      if (scrambleTurnsRef.current < 6) return;
      if (performance.now() - lastTurnAtRef.current < 1200) return;
      void analyseNow();
    }, 300);
    return () => clearInterval(id);
  }, [phase, analyseNow]);

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

  const finish = useCallback(
    (state: CubeState) => {
      const c = caseRef.current;
      if (!c) return;
      const used = cleanMoveStream(
        movesRef.current.map((m, i) => ({ move: m.move, t: (m.cubeTs ?? m.localTs) - startRef.current + i * 0 })),
      ).map((m) => m.move);
      // Which block did you actually build? Comparing your count against the
      // best block on the scramble alone would be unfair when you built a
      // different one, so both are worth saying.
      const chose = mode === 'fb' ? blocksBuilt(state)[0] : undefined;
      const choseBest = chose ? c.blocks?.find((b) => b.spec === chose)?.length : undefined;
      const attempt: Attempt = {
        mode,
        used,
        best: c.best,
        ms: performance.now() - startRef.current,
        thinkMs: Math.max(0, startRef.current - armedAtRef.current),
        chose,
        choseBest,
      };
      setLast(attempt);
      setHistory((h) => [...h, attempt]);
      setReveal(true);
      // First block has no next case to deal — scramble again when you are ready
      if (mode === 'fb') {
        scrambleTurnsRef.current = 0;
        setPhaseBoth('scrambling');
      } else {
        void deal();
      }
    },
    [mode, deal],
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
        if (next.status === 'complete') arm();
      },
      onMove: (m, state) => {
        live.turn(m.move, state);
        cubeRef.current = state;
        setCubeState(state);
        const p = phaseRef.current;

        if (p === 'scrambling') {
          scrambleTurnsRef.current++;
          lastTurnAtRef.current = performance.now();
          return;
        }

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
          {/* Following a real solve deals itself: you pick one from the list */}
          <div className={'flex gap-2 ' + (mode === 'pro' ? 'hidden' : '')}>
            {prep && (
              <span className="self-center text-[12px] text-ink-500">
                getting ready… {Math.round((prep.done / prep.total) * 100)}%
              </span>
            )}
            {dealing && !prep && <span className="self-center text-[12px] text-ink-500">working out the blocks…</span>}
            {phase === 'idle' ? (
              <button className="btn btn-primary !py-1 !text-[13px]" onClick={() => void deal()} disabled={dealing}>
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
        {mode !== 'pro' && (
          <p className="mt-2 text-[13px] text-ink-500">{MODES.find((m) => m.id === mode)!.blurb}</p>
        )}
      </section>

      {mode === 'pro' && <ProSolve usingCube={usingCube} keyboard={settings.keyboardCube} />}

      {mode !== 'pro' && !usingCube && (
        <section className="panel px-4 py-4 sm:px-5">
          <p className="max-w-[60ch] text-sm text-ink-400">
            Without a cube the app can still deal cases and show you the shortest solution, but it cannot tell you
            whether the one you found matches. Connect a cube from the top bar, or switch on the keyboard cube in
            Settings.
          </p>
        </section>
      )}

      {mode !== 'pro' && problem && (
        <section className="panel px-4 py-4 sm:px-5">
          <p className="text-sm text-warn">{problem}</p>
        </section>
      )}

      {mode !== 'pro' && phase === 'scrambling' && (
        <section className="panel flex flex-col items-center gap-4 px-4 py-6 sm:px-5">
          <p className="text-lg font-semibold text-cube-blue">Scramble your cube</p>
          <p className="max-w-[46ch] text-center text-[13px] text-ink-400">
            However you like — the app reads whatever position you end up in. It starts as soon as your hands stop.
          </p>
          <CubeView
            state={live.animate ? live.shown : cubeState}
            animate={live.animate}
            size={170}
          />
          <button className="btn btn-primary !py-1 !text-[13px]" onClick={() => void analyseNow()} disabled={dealing}>
            {dealing ? 'Reading the cube…' : 'Use it now'}
          </button>
        </section>
      )}

      {mode !== 'pro' && current && phase !== 'scrambling' && (
        <section className="panel flex flex-col items-center gap-4 px-4 py-5 sm:px-5">
          {phase === 'setup' && current.setup.length > 0 && (
            <div className="w-full">
              <p className="mb-2 text-center text-[13px] text-ink-500">
                {usingCube ? 'Turn this into your cube' : 'Apply this to your cube'}
              </p>
              <ScrambleGuide
                moves={sensed?.written ?? current.setup}
                progress={usingCube && sensed && progress ? progressInWritten(sensed, progress) : null}
              />
            </div>
          )}

          {(phase === 'armed' || phase === 'running') && (
            <p className={`text-lg font-semibold ${phase === 'armed' && usingCube ? 'armed text-good' : 'text-cube-blue'}`}>
              {phase === 'armed' ? 'Find the shortest solution' : 'Going…'}
            </p>
          )}

          {/* Your cube, all the way through — it used to freeze on the case the
              moment you started solving, which is exactly when you want to see it */}
          <CubeView
            state={usingCube ? (live.animate ? live.shown : cubeState) : caseState}
            animate={usingCube ? live.animate : null}
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
              ) : current.blocks ? (
                <BlockChoices choices={current.blocks} from={caseState} chosen={last?.chose} />
              ) : (
                <div className="flex flex-col items-center gap-2">
                  {current.solutions.map((sol, i) => (
                    <SolutionRow key={i} moves={sol} from={caseState} />
                  ))}
                </div>
              )}
            </div>
          )}

          {thinking && phase === 'armed' && usingCube && (
            <p className="text-[12px] text-ink-600">The clock starts on your first turn.</p>
          )}
        </section>
      )}

      {mode !== 'pro' && last && (
        <section className="panel px-4 py-4 sm:px-5">
          {last.chose && (
            <p className="mb-3 flex items-center justify-center gap-2 text-[13px] text-ink-400">
              You built <Swatch spec={last.chose} />
              <span className="text-ink-300">{last.chose.name}</span>
            </p>
          )}
          <div className="flex flex-wrap items-baseline justify-center gap-x-8 gap-y-2">
            <Figure
              value={String(last.used.length)}
              label="your solution"
              note={
                last.choseBest !== undefined
                  ? last.used.length <= last.choseBest
                    ? 'optimal for that block'
                    : `+${last.used.length - last.choseBest} over for that block`
                  : last.used.length <= last.best
                    ? 'optimal'
                    : `+${last.used.length - last.best} over`
              }
              tone={
                (last.choseBest !== undefined ? last.used.length <= last.choseBest : last.used.length <= last.best)
                  ? 'good'
                  : 'warn'
              }
            />
            {last.choseBest !== undefined && <Figure value={String(last.choseBest)} label="fewest for it" />}
            <Figure value={String(last.best)} label={last.chose ? 'best block here' : 'fewest'} />
            <Figure value={`${formatSeconds(last.ms)}s`} label="turning" />
            <Figure value={`${formatSeconds(last.thinkMs)}s`} label="thinking" />
          </div>
          <p className="mt-3 text-center font-mono text-[15px] text-ink-300">{formatAlg(last.used)}</p>
        </section>
      )}

      {mode !== 'pro' && summary && summary.count > 1 && (
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

/** The two colours that name a block: what would be down, and what would be left. */
function Swatch({ spec }: { spec: BlockSpec }) {
  return (
    <span className="inline-flex overflow-hidden rounded-[3px] ring-1 ring-ink-600">
      <span className="block size-3" style={{ background: FACE_COLORS[spec.down] }} title="down" />
      <span className="block size-3" style={{ background: FACE_COLORS[spec.left] }} title="left" />
    </span>
  );
}

/**
 * One solution, with the cube it leaves behind.
 *
 * A list of move sequences tells you nothing about which block each one builds.
 * Drawing the result, with that block's own pieces lit and everything else
 * dimmed, says it at a glance.
 */
function SolutionRow({
  moves,
  from,
  spec,
  highlighted,
}: {
  moves: string[];
  from: CubeState;
  spec?: BlockSpec;
  highlighted?: boolean;
}) {
  const after = useMemo(() => applyMoves(from, moves), [from, moves]);
  const highlight = useMemo(
    () => (spec ? piecesByColor(spec.pieces, after) : null),
    [spec, after],
  );
  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${highlighted ? 'bg-ink-800' : ''}`}
    >
      <CubeView state={after} highlight={highlight} size={62} interactive={false} />
      <div className="min-w-0">
        {spec && (
          <p className="flex items-center gap-1.5 text-[12px] text-ink-400">
            <Swatch spec={spec} />
            {spec.name}
          </p>
        )}
        <p className="font-mono text-[15px] text-ink-100">{formatAlg(moves)}</p>
      </div>
      <span className="tnum ml-auto font-mono text-sm text-ink-400">{moves.length}</span>
    </div>
  );
}

/** The cheapest blocks on this scramble, best first. */
function BlockChoices({
  choices,
  from,
  chosen,
}: {
  choices: BlockChoice[];
  from: CubeState;
  chosen?: BlockSpec;
}) {
  const shown = choices.slice(0, 5);
  return (
    <div className="flex w-full max-w-[30rem] flex-col gap-1">
      {shown.map((c) => (
        <SolutionRow
          key={c.spec.name}
          moves={c.solutions[0] ?? []}
          from={from}
          spec={c.spec}
          highlighted={chosen === c.spec}
        />
      ))}
      <p className="mt-1 text-center text-[12px] text-ink-500">
        best {shown.length} of {choices.length} blocks · worst is {choices[choices.length - 1].length}
      </p>
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
