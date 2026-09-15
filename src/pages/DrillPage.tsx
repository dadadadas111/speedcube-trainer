import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/app';
import { db, type AlgEntry, type Rep } from '../store/db';
import { SEED_ALGS } from '../data/seedAlgs';
import AlgLibrary from '../components/AlgLibrary';
import CmllTrainer from '../components/CmllTrainer';
import { classifyCornerAlg, describeFamily } from '../analysis/cornerCase';
import { formatAlg, invertAlg, parseAlg } from '../cube/alg';
import { cleanMoveStream } from '../cube/moveStream';
import { SOLVED_STATE, applyMoves, canonicalKey, cloneState, type CubeState } from '../cube/cube';
import { DrillMatcher, caseStateFor, summarizeDrill, type DrillRepData, type MoveStat } from '../analysis/drill';
import { useCubeInput } from '../smartcube/useCubeInput';
import { cubeLink } from '../smartcube/connection';
import { virtualCube } from '../smartcube/virtual';
import CubeView from '../components/CubeView';
import { formatSeconds } from '../analysis/stats';

type Phase = 'setup' | 'armed' | 'running' | 'done';

/** Seed the sample library exactly once, even when StrictMode runs effects twice. */
let seeding: Promise<void> | null = null;
function seedOnce(): Promise<void> {
  seeding ??= (async () => {
    const n = await db.algs.count();
    if (n === 0) await db.algs.bulkAdd(SEED_ALGS.map((a) => ({ ...a, createdAt: Date.now() })));
  })();
  return seeding;
}

export default function DrillPage() {
  const { settings, cubeStatus, bump, revision } = useApp();
  const usingCube = cubeStatus === 'connected' || settings.keyboardCube;
  const [algs, setAlgs] = useState<AlgEntry[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reps, setReps] = useState<Rep[]>([]);
  const [repCounts, setRepCounts] = useState<Map<number, number>>(new Map());
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<'one' | 'random'>('one');
  /**
   * Which part of the page a phone is showing.
   *
   * On a wide screen the library sits in its own column beside the drill and
   * everything is visible at once. Stacked on a phone it put four hundred and
   * eighty pixels of alg list above the case — so the one thing you are meant
   * to be looking at while you turn started below the fold, every single time.
   * A phone gets one of these at a time instead, and no scrolling.
   */
  const [pane, setPane] = useState<'drill' | 'cases' | 'stats'>('drill');
  const [scope, setScope] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    await seedOnce();
    const rows = await db.algs.orderBy('createdAt').toArray();
    setAlgs(rows);
    setSelectedId((cur) => (cur != null && rows.some((r) => r.id === cur) ? cur : (rows[0]?.id ?? null)));
    // rep counts per algorithm, so the library can show what has been left alone
    const counts = new Map<number, number>();
    await db.reps.each((r) => counts.set(r.algId, (counts.get(r.algId) ?? 0) + 1));
    setRepCounts(counts);
  }, []);

  useEffect(() => {
    void load();
  }, [load, revision]);

  useEffect(() => {
    if (selectedId == null) return;
    void db.reps.where('algId').equals(selectedId).sortBy('date').then(setReps);
  }, [selectedId, revision]);

  const selected = algs.find((a) => a.id === selectedId) ?? null;
  const familyKey = (a: AlgEntry) => a.group + ' / ' + a.family;

  /**
   * The families this drill can deal from.
   *
   * CMLL only: the mode deals a scramble that keeps both Roux blocks and stops
   * when the corners are done, which is a sentence that means nothing about a
   * PLL or a finger trick.
   */
  const allFamilies = useMemo(() => {
    const seen = new Map<string, { key: string; group: string; family: string; count: number }>();
    for (const a of algs.filter((x) => x.group === 'CMLL')) {
      const key = familyKey(a);
      const cur = seen.get(key);
      if (cur) cur.count++;
      else seen.set(key, { key, group: a.group, family: a.family, count: 1 });
    }
    return [...seen.values()];
  }, [algs]);

  // Entering the drill selects every family: all forty-two is the ordinary way
  // to practise CMLL, and narrowing it is the special case, not the default.
  useEffect(() => {
    if (mode !== 'random' || scope.size > 0 || !allFamilies.length) return;
    setScope(new Set(allFamilies.map((f) => f.key)));
  }, [mode, scope.size, allFamilies]);

  const pool = useMemo(
    () => algs.filter((a) => a.group === 'CMLL' && scope.has(familyKey(a))),
    [algs, scope],
  );

  const toggleScope = (key: string) =>
    setScope((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const removeAlg = async (id: number) => {
    await db.reps.where('algId').equals(id).delete();
    await db.algs.delete(id);
    if (selectedId === id) setSelectedId(null);
    bump();
  };

  // On a phone only the chosen pane is in the document; from lg up every pane
  // is, and the grid puts them where they have always been.
  const only = (p: 'drill' | 'cases' | 'stats') => (pane === p ? '' : 'hidden lg:block');

  return (
    // Random drilling picks its cases from the family chips, so the library is
    // just something to scroll past — it only appears when it is being used.
    <div className={mode === 'one' ? 'grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-5' : 'flex flex-col gap-4 lg:gap-5'}>
      {/* Phone only: the page's own tabs. Picking a case jumps you back to the
          drill, because that is why you went looking for one. */}
      <div className="flex gap-1 lg:hidden">
        {([
          ['drill', 'Drill'],
          ['cases', mode === 'one' ? 'Cases' : 'Families'],
          ['stats', 'Stats'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setPane(id)}
            className={
              'flex-1 rounded-md border px-2 py-1 text-[13px] transition-colors ' +
              (pane === id ? 'border-cube-blue bg-ink-800 text-ink-100' : 'border-ink-700 text-ink-400')
            }
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'one' && (
        <div className={only('cases')}>
          <AlgLibrary
            algs={algs}
            repCounts={repCounts}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setPane('drill');
            }}
            onAdd={() => setAdding(true)}
          />
        </div>
      )}

      <div className="flex flex-col gap-4 lg:gap-5">
        <div className={'flex flex-wrap items-center gap-2 ' + only('cases')}>
          <button
            className={'btn !py-1 !text-[13px] ' + (mode === 'one' ? '!border-cube-blue !text-cube-blue' : '')}
            onClick={() => setMode('one')}
          >
            Single case
          </button>
          <button
            className={'btn !py-1 !text-[13px] ' + (mode === 'random' ? '!border-cube-blue !text-cube-blue' : '')}
            onClick={() => setMode('random')}
          >
            CMLL
          </button>
        </div>

        {mode === 'random' && (
          <section className={'panel p-4 ' + only('cases')}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[13px] text-ink-400">
                {scope.size === allFamilies.length ? 'All of CMLL' : `${pool.length} cases`}
              </p>
              <div className="flex gap-1.5">
                <button
                  className="btn btn-ghost !px-2 !py-0.5 !text-[12px]"
                  onClick={() => setScope(new Set(allFamilies.map((f) => f.key)))}
                >
                  All
                </button>
                <button className="btn btn-ghost !px-2 !py-0.5 !text-[12px]" onClick={() => setScope(new Set())}>
                  None
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allFamilies.map((f) => {
                const on = scope.has(f.key);
                return (
                  <button
                    key={f.key}
                    onClick={() => toggleScope(f.key)}
                    className={
                      'rounded-full border px-2.5 py-1 text-[13px] transition-colors ' +
                      (on
                        ? 'border-cube-blue bg-[color-mix(in_srgb,var(--color-cube-blue)_18%,transparent)] text-ink-100'
                        : 'border-ink-600 text-ink-300 hover:bg-ink-800')
                    }
                  >
                    {f.family}
                    <span className="ml-1.5 text-ink-500">{f.count}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {mode === 'random' && (
          <CmllTrainer
            pane={pane}
            pool={pool}
            usingCube={usingCube}
            keyboard={settings.keyboardCube}
            repCounts={repCounts}
            onRepSaved={() => void load()}
          />
        )}

        {mode === 'one' && adding && (
          <AlgForm
            algs={algs}
            onClose={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              void load();
            }}
            usingCube={usingCube}
            keyboard={settings.keyboardCube}
          />
        )}
        {mode === 'one' && (selected ? (
          <AlgDetail
            pane={pane}
            key={selected.id}
            alg={selected}
            reps={reps}
            usingCube={usingCube}
            keyboard={settings.keyboardCube}
            onRepSaved={() => selectedId != null && void db.reps.where('algId').equals(selectedId).sortBy('date').then(setReps)}
            onDelete={() => selected.id && void removeAlg(selected.id)}
          />
        ) : (
          <p className={'panel p-6 text-sm text-ink-400 ' + only('drill')}>
            Pick an algorithm from Cases, or add a new one.
          </p>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function AlgForm({
  algs,
  onClose,
  onSaved,
  usingCube,
  keyboard,
}: {
  algs: AlgEntry[];
  onClose: () => void;
  onSaved: () => void;
  usingCube: boolean;
  keyboard: boolean;
}) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('CMLL');
  const [family, setFamily] = useState('');
  const [familyTouched, setFamilyTouched] = useState(false);
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const recorded = useRef<{ move: string; t: number }[]>([]);

  useCubeInput(
    {
      onMove: (m) => {
        if (!recording) return;
        recorded.current.push({ move: m.move, t: m.cubeTs ?? m.localTs });
        setText(formatAlg(cleanMoveStream(recorded.current).map((x) => x.move)));
      },
    },
    keyboard,
  );

  /** Classify every stored algorithm, to compare against the one being typed. */
  const known = useMemo(
    () =>
      algs.map((a) => {
        try {
          return { entry: a, info: classifyCornerAlg(parseAlg(a.alg)) };
        } catch {
          return { entry: a, info: null };
        }
      }),
    [algs],
  );

  const parsed = useMemo(() => {
    try {
      return text.trim() ? parseAlg(text) : null;
    } catch {
      return null;
    }
  }, [text]);

  const info = useMemo(() => (parsed ? classifyCornerAlg(parsed) : null), [parsed]);
  const sameCase = useMemo(
    () => (info ? known.filter((k) => k.info?.full === info.full) : []),
    [known, info],
  );
  const sameFamily = useMemo(
    () => (info ? known.filter((k) => k.info?.family === info.family) : []),
    [known, info],
  );

  // Fill the family from a matching stored algorithm, until it is typed by hand
  useEffect(() => {
    if (familyTouched || !sameFamily.length) return;
    const counts = new Map<string, number>();
    for (const k of sameFamily) counts.set(k.entry.family, (counts.get(k.entry.family) ?? 0) + 1);
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) {
      setFamily(best[0]);
      setGroup(sameFamily[0].entry.group);
    }
  }, [sameFamily, familyTouched]);

  const families = useMemo(() => [...new Set(algs.map((a) => a.family))].sort(), [algs]);
  const groups = useMemo(() => [...new Set(algs.map((a) => a.group))].sort(), [algs]);
  const valid = !!parsed && parsed.length > 0 && name.trim() !== '' && family.trim() !== '';

  const save = async () => {
    if (!parsed) return;
    await db.algs.add({
      name: name.trim(),
      group: group.trim() || 'Other',
      family: family.trim(),
      alg: formatAlg(parsed),
      createdAt: Date.now(),
    });
    onSaved();
  };

  return (
    <section className="panel p-5">
      <h2 className="text-base font-semibold">Add an algorithm</h2>

      <div className="mt-4">
        <label className="field-label" htmlFor="alg-text">
          Notation
        </label>
        <input
          id="alg-text"
          className="input font-mono"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="R U R' U R U2 R'"
        />
        {text.trim() !== '' && !parsed && (
          <p className="mt-1.5 text-[13px] text-bad">
            There is a move here that cannot be read. Use standard notation: R U R' U2 M' r ...
          </p>
        )}
        {info && (
          <div className="mt-2 text-[13px]">
            <p className="text-ink-300">
              Case recognised: <span className="text-ink-100">{describeFamily(info.family)}</span>
              {!info.preservesBlocks && <span className="ml-2 text-warn">this algorithm breaks the Roux blocks</span>}
            </p>
            {sameCase.length > 0 && (
              <p className="mt-1 text-warn">
                You already have an algorithm for this case: {sameCase.map((k) => `${k.entry.family} · ${k.entry.name}`).join(', ')}
              </p>
            )}
            {sameCase.length === 0 && sameFamily.length > 0 && (
              <p className="mt-1 text-good">
                Same family as: {[...new Set(sameFamily.map((k) => k.entry.family))].join(', ')} — the Family field is filled in.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="field-label" htmlFor="alg-group">
            Set
          </label>
          <input
            id="alg-group"
            className="input"
            list="alg-groups"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder="CMLL"
          />
          <datalist id="alg-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="field-label" htmlFor="alg-family">
            Family
          </label>
          <input
            id="alg-family"
            className="input"
            list="alg-families"
            value={family}
            onChange={(e) => {
              setFamily(e.target.value);
              setFamilyTouched(true);
            }}
            placeholder="Sune"
          />
          <datalist id="alg-families">
            {families.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="field-label" htmlFor="alg-name">
            Case name
          </label>
          <input
            id="alg-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="diagonal, left, right..."
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" disabled={!valid} onClick={() => void save()}>
          Save
        </button>
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        {usingCube && (
          <button
            className={'btn ' + (recording ? '!border-bad !text-bad' : '')}
            onClick={() => {
              if (!recording) recorded.current = [];
              setRecording(!recording);
            }}
          >
            {recording ? 'Stop recording' : 'Record from cube'}
          </button>
        )}
        {recording && <span className="armed text-[13px] text-bad">Recording — just perform the algorithm on the cube</span>}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function AlgDetail({
  pane,
  alg,
  reps,
  usingCube,
  keyboard,
  onRepSaved,
  onDelete,
}: {
  pane: 'drill' | 'cases' | 'stats';
  alg: AlgEntry;
  reps: Rep[];
  usingCube: boolean;
  keyboard: boolean;
  onRepSaved: () => void;
  onDelete: () => void;
}) {
  const only = (p: 'drill' | 'cases' | 'stats') => (pane === p ? '' : 'hidden lg:block');
  const moves = useMemo(() => {
    try {
      return parseAlg(alg.alg);
    } catch {
      return [];
    }
  }, [alg.alg]);
  const setupMoves = useMemo(() => invertAlg(moves), [moves]);
  const caseState = useMemo(() => caseStateFor(moves, SOLVED_STATE), [moves]);
  const caseKey = useMemo(() => canonicalKey(caseState), [caseState]);

  const repData: DrillRepData[] = useMemo(
    () => reps.map((r) => ({ date: r.date, recognitionMs: r.recognitionMs, execMs: r.execMs, moveTimes: r.moveTimes, extraMoves: r.extraMoves, success: r.success })),
    [reps],
  );
  const summary = useMemo(() => summarizeDrill(moves, repData), [moves, repData]);

  /* ----- state machine for one drill rep ----- */
  const [phase, setPhase] = useState<Phase>('setup');
  const [progress, setProgress] = useState(0);
  const [lastRep, setLastRep] = useState<DrillRepData | null>(null);
  const [cubeState, setCubeState] = useState<CubeState>(cloneState(SOLVED_STATE));
  const phaseRef = useRef<Phase>('setup');
  const matcherRef = useRef<DrillMatcher | null>(null);
  const armedAtRef = useRef(0);

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // A reset in the middle of a timed rep would throw the rep away
  useEffect(() => {
    if (phase !== 'armed' && phase !== 'running') return;
    return cubeLink.holdResetGesture();
  }, [phase]);

  useEffect(() => {
    setPhaseBoth('setup');
    setProgress(0);
    setLastRep(null);
    matcherRef.current = null;
  }, [alg.id]);

  const finishRep = useCallback(
    async (success: boolean, times: (number | null)[], mistakes: number) => {
      const execMs = times[times.length - 1] ?? 0;
      const rep: DrillRepData = {
        date: Date.now(),
        recognitionMs: armedAtRef.current ? matcherRef.current?.startedAt ?? 0 : 0,
        execMs: execMs ?? 0,
        moveTimes: times,
        extraMoves: mistakes,
        success,
      };
      const recognitionMs = matcherRef.current?.startedAt != null ? matcherRef.current.startedAt - armedAtRef.current : 0;
      rep.recognitionMs = Math.max(0, recognitionMs);
      setLastRep(rep);
      setPhaseBoth('done');
      if (alg.id) {
        await db.reps.add({ algId: alg.id, ...rep });
        onRepSaved();
      }
    },
    [alg.id, onRepSaved],
  );

  useCubeInput(
    {
      onState: (s) => {
        setCubeState(s);
        const p = phaseRef.current;
        if ((p === 'setup' || p === 'done') && canonicalKey(s) === caseKey) {
          matcherRef.current = new DrillMatcher(moves, caseState);
          armedAtRef.current = performance.now();
          setProgress(0);
          setPhaseBoth('armed');
        }
      },
      onMove: (m, state) => {
        const p = phaseRef.current;
        if (p !== 'armed' && p !== 'running') return;
        const matcher = matcherRef.current;
        if (!matcher) return;
        if (p === 'armed') setPhaseBoth('running');
        const res = matcher.feed(state, m.cubeTs ?? m.localTs);
        setProgress(res.index);
        if (res.event === 'complete') void finishRep(true, res.moveTimes, matcher.mistakes);
      },
    },
    keyboard,
  );

  return (
    <>
      <section className={'panel p-4 sm:p-5 ' + only('drill')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[13px] text-ink-400">
              {alg.group} · {alg.family}
            </p>
            <h2 className="text-lg font-semibold sm:text-xl">{alg.name}</h2>
          </div>
          {/* Deleting belongs with choosing, not with drilling — and on a phone
              it was the widest thing in the row it shared with the case name.
              Wrapped rather than given `hidden` directly: .btn sets its own
              display and wins. */}
          <div className="hidden lg:block">
            <button className="btn btn-danger !py-1 !text-[13px]" onClick={onDelete}>
              Delete algorithm
            </button>
          </div>
        </div>
        {alg.notes && <p className="mt-2 max-w-[60ch] text-[13px] text-ink-400">{alg.notes}</p>}

        <AlgLine moves={moves} stats={summary.moveStats} progress={phase === 'running' || phase === 'done' ? progress : -1} />

        {/* The two cubes side by side rather than stacked: on a phone that is
            the difference between seeing both and scrolling for the second. */}
        <div className="mt-4 flex flex-wrap items-start gap-4">
          <div>
            <p className="mb-1.5 text-[13px] text-ink-400">The case</p>
            <CubeView state={caseState} size={150} />
          </div>
          {usingCube && (
            <div>
              <p className="mb-1.5 text-[13px] text-ink-400">Your cube</p>
              <CubeView state={cubeState} size={150} />
            </div>
          )}
          <div className="min-w-[15rem] flex-1">
            {!usingCube ? (
              <p className="text-sm text-ink-400">
                Drilling needs a smart cube. Connect one from the top bar, or switch on the keyboard cube in
                Settings.
              </p>
            ) : (
              <DrillStatus
                phase={phase}
                progress={progress}
                total={moves.length}
                setupMoves={setupMoves}
                lastRep={lastRep}
                summary={summary}
                keyboard={keyboard}
                onSetupVirtual={() => virtualCube.setState(applyMoves(SOLVED_STATE, invertAlg(moves)))}
              />
            )}
          </div>
        </div>
      </section>

      {summary.reps > 0 ? (
        <div className={only('stats')}>
          <DrillStats summary={summary} />
        </div>
      ) : (
        // A tab with nothing in it should say why, not look broken
        <p className={'panel p-6 text-sm text-ink-400 lg:hidden ' + only('stats')}>
          No reps yet. Drill this case a few times and the numbers turn up here — where you hesitate, and how
          much of each attempt is spent standing still.
        </p>
      )}
      {/* Managing the case lives where you choose one, not where you drill it
          or where you read the numbers. */}
      <div className={'lg:hidden ' + only('cases')}>
        <button className="btn btn-danger !py-1 !text-[13px]" onClick={onDelete}>
          Delete algorithm
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function DrillStatus({
  phase,
  progress,
  total,
  setupMoves,
  lastRep,
  summary,
  keyboard,
  onSetupVirtual,
}: {
  phase: Phase;
  progress: number;
  total: number;
  setupMoves: string[];
  lastRep: DrillRepData | null;
  summary: ReturnType<typeof summarizeDrill>;
  keyboard: boolean;
  onSetupVirtual: () => void;
}) {
  return (
    <div>
      {phase === 'setup' && (
        <>
          <p className="text-lg font-semibold text-warn">Set the cube into the case</p>
          <p className="mt-1 text-sm text-ink-300">From solved, perform:</p>
          <p className="mt-1.5 font-mono text-[15px] text-ink-100">{setupMoves.join(' ')}</p>
          {keyboard && (
            <button className="btn mt-3 !py-1 !text-[13px]" onClick={onSetupVirtual}>
              Set the virtual cube into the case
            </button>
          )}
        </>
      )}
      {phase === 'armed' && (
        <>
          <p className="armed text-lg font-semibold text-good">Ready — the first move starts the timer</p>

        </>
      )}
      {phase === 'running' && (
        <>
          <p className="text-lg font-semibold text-cube-blue">
            Running — move {progress}/{total}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
            <div className="h-full bg-cube-blue transition-[width]" style={{ width: `${(progress / total) * 100}%` }} />
          </div>
        </>
      )}
      {phase === 'done' && lastRep && (
        <>
          <p className="text-lg font-semibold text-good">
            Done — {formatSeconds(lastRep.execMs)}s
            {isFinite(summary.bestExecMs) && lastRep.execMs <= summary.bestExecMs && (
              <span className="ml-2 text-warn">personal best</span>
            )}
          </p>
          <p className="mt-1 text-sm text-ink-300">
            Recognition {formatSeconds(lastRep.recognitionMs)}s · {(total / (lastRep.execMs / 1000)).toFixed(1)} TPS
            {lastRep.extraMoves > 0 && <span className="text-bad"> · {lastRep.extraMoves} wrong moves</span>}
          </p>
          <p className="mt-2 text-sm text-ink-400">Set the cube back into the case for the next rep.</p>
          <p className="mt-1 font-mono text-[15px] text-ink-200">{setupMoves.join(' ')}</p>
          {keyboard && (
            <button className="btn mt-3 !py-1 !text-[13px]" onClick={onSetupVirtual}>
              Set the virtual cube into the case
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** The algorithm written out, each move coloured by how much you hesitate there. */
function AlgLine({ moves, stats, progress }: { moves: string[]; stats: MoveStat[]; progress: number }) {
  return (
    <div className="mt-4 flex flex-wrap gap-1.5">
      {moves.map((m, i) => {
        const s = stats[i];
        const h = s?.samples >= 2 ? s.hesitation : 0;
        const color = h > 2 ? '#e0384f' : h > 1.5 ? '#ffcf2e' : h > 0 ? '#17b26a' : '#5d6d80';
        const done = progress >= 0 && i < progress;
        const current = progress >= 0 && i === progress;
        return (
          <span
            key={i}
            title={s?.samples ? `${Math.round(s.medianMs)}ms · ${s.samples} reps` : 'no data yet'}
            className="flex flex-col items-center gap-1 rounded-[4px] border px-2 py-1 font-mono text-[15px] transition-colors"
            style={{
              borderColor: current ? '#2f7ff2' : 'var(--color-ink-700)',
              background: current ? 'rgba(47,127,242,.18)' : done ? 'var(--color-ink-800)' : 'transparent',
              color: done ? 'var(--color-ink-400)' : 'var(--color-ink-100)',
            }}
          >
            {m}
            <span className="block h-[3px] w-full rounded-[1px]" style={{ background: color, opacity: h ? 1 : 0.3 }} />
          </span>
        );
      })}
    </div>
  );
}

function DrillStats({ summary }: { summary: ReturnType<typeof summarizeDrill> }) {
  const max = Math.max(
    1,
    summary.medianRecognitionMs || 0,
    ...summary.moveStats.map((s) => s.p75Ms || s.medianMs || 0),
  );
  return (
    <section className="panel p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">Where you hesitate</h2>
        <span className="text-[12px] text-ink-500">median over {summary.reps} reps</span>
      </div>

      <div className="mt-4 flex items-end gap-1 overflow-x-auto pb-1">
        {/* The first move has no "gap from the previous move", so that slot shows
            recognition instead: from entering the case until your hands move. */}
        <div className="flex min-w-[54px] flex-col items-center gap-1 border-r border-ink-700 pr-2">
          <span className="tnum font-mono text-[11px] text-ink-400">
            {isNaN(summary.medianRecognitionMs) ? '—' : Math.round(summary.medianRecognitionMs)}
          </span>
          <div className="flex h-[130px] w-full items-end justify-center">
            <div
              className="w-full rounded-t-[3px] bg-ink-400"
              style={{ height: `${Math.min(130, (summary.medianRecognitionMs / max) * 130 || 0)}px`, opacity: 0.7 }}
            />
          </div>
          <span className="text-[12px] text-ink-400">recognition</span>
        </div>
        {summary.moveStats.slice(1).map((s) => {
          const h = s.samples ? (s.medianMs / max) * 130 : 0;
          const color = s.hesitation > 2 ? '#e0384f' : s.hesitation > 1.5 ? '#ffcf2e' : '#17b26a';
          return (
            <div key={s.index} className="flex min-w-[38px] flex-1 flex-col items-center gap-1">
              <span className="tnum font-mono text-[11px] text-ink-400">{s.samples ? Math.round(s.medianMs) : '—'}</span>
              <div className="flex h-[130px] w-full items-end justify-center">
                <div className="w-full rounded-t-[3px]" style={{ height: `${h}px`, background: color, opacity: 0.85 }} />
              </div>
              <span className="font-mono text-[13px]">{s.move}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-ink-700 pt-4 sm:grid-cols-5">
        <Metric label="Reps" value={String(summary.reps)} />
        <Metric label="Best" value={`${formatSeconds(summary.bestExecMs)}s`} />
        <Metric label="Median" value={`${formatSeconds(summary.medianExecMs)}s`} />
        <Metric label="Last 5" value={`${formatSeconds(summary.recentExecMs)}s`} />
        <Metric label="TPS" value={summary.tps.toFixed(1)} />
      </div>

      {summary.worstMoves.length > 0 && (
        <p className="mt-4 max-w-[70ch] text-sm text-warn">
          Worth drilling on its own:{' '}
          {summary.worstMoves.map((w) => `move ${w.index + 1} (${w.move}, ${Math.round(w.medianMs)}ms)`).join(', ')}.
        </p>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[13px] text-ink-400">{label}</p>
      <p className="tnum font-mono text-lg">{value}</p>
    </div>
  );
}
