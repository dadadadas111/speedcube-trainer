/**
 * A step drilled against the virtual cube, one case straight after another.
 *
 * The ordinary drill spends most of a session setting cases up. You are handed
 * a scramble, you perform it, and only then does the part worth practising
 * begin. This removes that half: the case appears on screen, the cube in your
 * hands is only a move source, and whatever state it drifts into does not
 * matter. Finish one and the next is already there.
 *
 * csTimer does the same for OLL and PLL. It cannot do it for CMLL or EOLR,
 * because its completion test is "the scramble is undone" with a few
 * exceptions written in by hand. Ours asks what finishing the step actually
 * means: four top corners placed with the edges ignored, or six edges
 * oriented with UL and UR placed and the slice left for 4c.
 *
 * The two steps want different pictures. CMLL is read from four corners that
 * between them touch every side, so it gets the flattened top layer every
 * printed sheet uses. EOLR reaches the DF and DB edges underneath, which no
 * top-down diagram can show, so it gets the full net instead — six faces laid
 * out, nothing round the back.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db, type AlgEntry, type Rep } from '../store/db';
import { parseAlg } from '../cube/alg';
import { applyMove, cloneState, SOLVED_STATE, type CubeState } from '../cube/cube';
import { cmllDone } from '../analysis/cmll';
import { ORIENTATIONS, dealDrill, orientationByKey, recolourState } from '../analysis/cmllDrill';
import { LSE_EDGE_FACELETS, dealEolr, eolrDone } from '../analysis/eolrDrill';
import { formatSeconds } from '../analysis/stats';
import { useCubeInput } from '../smartcube/useCubeInput';
import CubeView from './CubeView';
import CubeNet from './CubeNet';
import CmllFace from './CmllFace';

interface Props {
  pane: 'drill' | 'cases' | 'stats';
  pool: AlgEntry[];
  usingCube: boolean;
  keyboard: boolean;
  onRepSaved: () => void;
}

interface Done {
  /** CMLL cases come from the algorithm library; EOLR cases do not */
  entry: AlgEntry | null;
  label: string;
  recognitionMs: number;
  execMs: number;
  /** EOLR only: turns taken against the fewest possible */
  moves?: number;
  best?: number;
  at: number;
}

type Step = 'cmll' | 'eolr';
/** Whether the clock you are racing includes the looking. */
type Timing = 'all' | 'exec';

export default function ContinuousDrill({ pane, pool, usingCube, keyboard, onRepSaved }: Props) {
  const [step, setStep] = useState<Step>('cmll');
  const [running, setRunning] = useState(false);
  const [show, setShow] = useState<'clean' | 'full'>('clean');
  const [timing, setTiming] = useState<Timing>('all');
  const [orientKey, setOrientKey] = useState('yellow-green');
  const [virtual, setVirtual] = useState<CubeState>(() => cloneState(SOLVED_STATE));
  const [best, setBest] = useState<number | null>(null);
  const [history, setHistory] = useState<Done[]>([]);
  const [shown, setShown] = useState(0);

  const orientation = useMemo(() => orientationByKey(orientKey), [orientKey]);

  // The handlers run inside the cube's event stream and cannot wait for a render
  const virtualRef = useRef<CubeState>(cloneState(SOLVED_STATE));
  const targetRef = useRef<AlgEntry | null>(null);
  const bestRef = useRef<number | null>(null);
  const stepRef = useRef<Step>('cmll');
  const runningRef = useRef(false);
  const dealtAtRef = useRef(0);
  const firstMoveRef = useRef(0);
  const movesRef = useRef(0);
  const poolRef = useRef(pool);
  useEffect(() => { poolRef.current = pool; }, [pool]);
  useEffect(() => { stepRef.current = step; }, [step]);

  const deal = useCallback(() => {
    if (stepRef.current === 'eolr') {
      const d = dealEolr();
      if (!d) { runningRef.current = false; setRunning(false); return; }
      virtualRef.current = d.state;
      targetRef.current = null;
      bestRef.current = d.best;
      setVirtual(d.state);
      setBest(d.best);
    } else {
      const d = dealDrill(poolRef.current, parseAlg);
      if (!d) { runningRef.current = false; setRunning(false); return; }
      virtualRef.current = d.state;
      targetRef.current = d.entry;
      bestRef.current = null;
      setVirtual(d.state);
      setBest(null);
    }
    dealtAtRef.current = performance.now();
    // Zero until the first turn, so the clock cannot start before you have
    // even looked at the case.
    firstMoveRef.current = 0;
    movesRef.current = 0;
  }, []);

  const start = useCallback(() => {
    runningRef.current = true;
    setRunning(true);
    setHistory([]);
    deal();
  }, [deal]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    targetRef.current = null;
  }, []);

  const finish = useCallback(async (at: number) => {
    const entry = targetRef.current;
    const eolr = stepRef.current === 'eolr';
    if (!eolr && !entry?.id) return;
    const recognitionMs = Math.max(0, (firstMoveRef.current || at) - dealtAtRef.current);
    const execMs = Math.max(0, at - (firstMoveRef.current || at));
    setHistory((h) => [{
      entry: eolr ? null : entry,
      label: eolr ? 'EOLR' : `${entry!.family} · ${entry!.name}`,
      recognitionMs,
      execMs,
      moves: eolr ? movesRef.current : undefined,
      best: eolr ? (bestRef.current ?? undefined) : undefined,
      at: Date.now(),
    }, ...h].slice(0, 12));
    deal();

    // Only CMLL has a row to attach to. An EOLR case is generated by the
    // solver, not drawn from the algorithm library, so inventing an algId for
    // it would put a lie in the statistics.
    if (eolr || !entry?.id) return;
    const rep: Omit<Rep, 'id'> = {
      algId: entry.id,
      date: Date.now(),
      recognitionMs,
      execMs,
      // Per-move times need the stored algorithm to be the one performed, and
      // here any solution that finishes the step counts. A total is honest;
      // invented splits would not be.
      moveTimes: [],
      extraMoves: 0,
      success: true,
    };
    await db.reps.add(rep);
    onRepSaved();
  }, [deal, onRepSaved]);

  useCubeInput(
    {
      // Only onMove. The real cube's own state is irrelevant here: it is not
      // in the pictured position and never will be, which is the entire point.
      onMove: (m) => {
        if (!runningRef.current) return;
        const next = applyMove(virtualRef.current, m.move);
        virtualRef.current = next;
        setVirtual(next);
        movesRef.current += 1;
        // performance.now() throughout rather than the cube's own clock: what
        // is being measured is how long you looked and how long you turned,
        // both of which are wall time on this machine.
        const now = performance.now();
        if (!firstMoveRef.current) firstMoveRef.current = now;
        const done = stepRef.current === 'eolr' ? eolrDone(next) : cmllDone(next);
        if (done) void finish(now);
      },
    },
    keyboard,
  );

  // A clock that only redraws while something is being timed
  useEffect(() => {
    if (!running) return;
    setShown(performance.now());
    const id = setInterval(() => setShown(performance.now()), 50);
    return () => clearInterval(id);
  }, [running]);

  // Changing step mid-run would score the new case against the old rules
  useEffect(() => { if (running) stop(); }, [step]);  // eslint-disable-line react-hooks/exhaustive-deps

  // `shown` is the ticking clock, and reading it is what makes this recompute.
  const elapsed = !running
    ? 0
    : timing === 'exec'
      ? firstMoveRef.current
        ? shown - firstMoveRef.current
        : 0
      : shown - dealtAtRef.current;

  const median = (xs: number[]) => {
    if (!xs.length) return NaN;
    const a = [...xs].sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const totals = history.map((h) => (timing === 'exec' ? h.execMs : h.recognitionMs + h.execMs));
  const painted = recolourState(virtual, orientation);
  const ready = step === 'eolr' || pool.length > 0;

  if (pane !== 'drill') return null;

  return (
    <section className="panel flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Continuous {step === 'eolr' ? 'EOLR' : 'CMLL'}</h2>
        {!running ? (
          <button className="btn btn-primary !py-1 !text-[13px]" onClick={start} disabled={!ready}>
            Start
          </button>
        ) : (
          <button className="btn !py-1 !text-[13px]" onClick={stop}>Stop</button>
        )}
      </div>

      {/* Each of these changes what is being practised, which is why they are
          here and not buried in Settings. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-400">
        <span className="flex items-center gap-1.5">
          Step
          <select className="input !w-auto !py-0.5 !text-[13px]" value={step} onChange={(e) => setStep(e.target.value as Step)}>
            <option value="cmll">CMLL</option>
            <option value="eolr">EOLR</option>
          </select>
        </span>
        <span className="flex items-center gap-1.5">
          Show
          <select className="input !w-auto !py-0.5 !text-[13px]" value={show} onChange={(e) => setShow(e.target.value as 'clean' | 'full')}>
            <option value="clean">{step === 'eolr' ? 'the six edges' : 'corners, flattened'}</option>
            <option value="full">whole cube</option>
          </select>
        </span>
        <span className="flex items-center gap-1.5">
          Holding
          <select className="input !w-auto !py-0.5 !text-[13px]" value={orientKey} onChange={(e) => setOrientKey(e.target.value)}>
            {ORIENTATIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.up} top, {o.front} front</option>
            ))}
          </select>
        </span>
        <span className="flex itemsor-center gap-1.5">
          Clock
          <select className="input !w-auto !py-0.5 !text-[13px]" value={timing} onChange={(e) => setTiming(e.target.value as Timing)}>
            <option value="all">recognition + execution</option>
            <option value="exec">execution only</option>
          </select>
        </span>
      </div>

      {!running && !usingCube && !keyboard && (
        <p className="text-[13px] text-warn">
          Connect a cube, or switch on the keyboard cube in Settings. Your cube does not need to match what is
          drawn &mdash; it only supplies the turns.
        </p>
      )}

      {running ? (
        <>
          <p className="tnum text-center font-mono text-4xl font-semibold leading-none">
            {formatSeconds(Math.max(0, elapsed))}
          </p>
          {/* EOLR reaches the DF and DB edges underneath, which no top-down
              diagram can show, so it gets the whole net. CMLL does not, so it
              gets the flattened top layer instead. */}
          {show === 'full' ? (
            <CubeView state={painted} size={190} className="self-center" />
          ) : step === 'eolr' ? (
            <CubeNet state={painted} highlight={LSE_EDGE_FACELETS} size={230} className="self-center" />
          ) : (
            <CmllFace state={painted} cornersOnly size={200} className="self-center" />
          )}
          <div className="flex items-center justify-center gap-3">
            <p className="text-[12px] text-ink-500">
              Execute it. The next case comes by itself.
              {best != null && <span className="tnum"> Best is {best} turns.</span>}
            </p>
            {/* CMLL needs both blocks back as well as the corners, exactly as a
                real solve does. Mangle them and nothing you do will ever count,
                so there has to be a way out that is not Stop. */}
            <button className="btn btn-ghost !py-0.5 !text-[12px]" onClick={deal}>Skip</button>
          </div>
        </>
      ) : (
        <p className="text-[13px] text-ink-400">
          A case appears above; read it, perform it on your own cube, and the moment the step is finished the next
          one is dealt. The cube in your hands never has to match the picture.
          {step === 'eolr' && ' EOLR is 4a and 4b together: six edges oriented, UL and UR placed, the slice left for 4c.'}
        </p>
      )}

      {history.length > 0 && (
        <div className="mt-1">
          <div className="flex items-baseline justify-between text-[12px] text-ink-500">
            <span>{history.length} done</span>
            <span className="tnum">median {formatSeconds(median(totals))}s</span>
          </div>
          <ul className="mt-1 flex flex-col gap-0.5">
            {history.map((h, i) => (
              <li key={i} className="flex items-baseline gap-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-ink-300">
                  {h.label}
                  {h.moves != null && (
                    <span className="tnum text-ink-500"> {h.moves}/{h.best} turns</span>
                  )}
                </span>
                <span className="tnum text-ink-500">{formatSeconds(h.recognitionMs)}</span>
                <span className="tnum w-14 text-right text-ink-100">{formatSeconds(h.execMs)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-ink-600">
            recognition · execution{step === 'eolr' && ' — EOLR reps are not saved: there is no algorithm row to attach them to'}
          </p>
        </div>
      )}
    </section>
  );
}
