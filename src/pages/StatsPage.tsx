import { useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

/** Data charts do not need an entrance animation — it only delays reading. */
const NO_ANIM = { isAnimationActive: false } as const;
import { useApp } from '../store/app';
import { db, type Solve, type Session } from '../store/db';
import { analyzeSolveRecord } from '../analysis/pipeline';
import { aggregateSteps, buildInsights } from '../analysis/recommend';
import { cmllEncounterOf } from '../analysis/cmllStats';
import CmllCaseStats from '../components/CmllCaseStats';
import { averageOf, bestAverage, effectiveTime, formatTime, meanOf, rollingAverage, stdevOf } from '../analysis/stats';
import { stepColor } from '../components/palette';

const AXIS = { stroke: '#5d6d80', fontSize: 11 };
const GRID = '#222b37';

const tooltipStyle = {
  background: '#1a212b',
  border: '1px solid #2e3a49',
  borderRadius: 8,
  fontSize: 13,
  color: '#e7edf3',
};

/** How far back "lately" reaches, for comparing against before. */
const WINDOWS = [
  { id: '7d', label: '7 days', ms: 7 * 864e5 },
  { id: '30d', label: '30 days', ms: 30 * 864e5 },
  { id: '90d', label: '90 days', ms: 90 * 864e5 },
] as const;

export default function StatsPage() {
  const { sessionId, settings, revision, bump } = useApp();
  const [solves, setSolves] = useState<Solve[]>([]);
  const [scope, setScope] = useState<'session' | 'all'>('session');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [window, setWindow] = useState<(typeof WINDOWS)[number]['id']>('30d');
  const [showSessions, setShowSessions] = useState(false);
  /**
   * Which part of the numbers is on screen.
   *
   * All of it at once was a page you scrolled past rather than read — the
   * per-case table, which is the part worth acting on, sat below four charts.
   * Four short pages beat one long one when they answer different questions.
   */
  const [tab, setTab] = useState<'overview' | 'steps' | 'cmll' | 'advice'>('overview');

  useEffect(() => {
    void db.sessions.orderBy('createdAt').toArray().then(setSessions);
  }, [revision]);

  /** Sessions deliberately left out of the numbers. */
  const excluded = useMemo(
    () => new Set(sessions.filter((x) => x.countsForStats === false).map((x) => x.id)),
    [sessions],
  );

  useEffect(() => {
    const load = async () => {
      const rows =
        scope === 'session'
          ? await db.solves.where('sessionId').equals(sessionId).sortBy('date')
          : // A session for deliberately slow solving is real practice and worth
            // keeping, but averaged in with timed solves it describes neither
            (await db.solves.orderBy('date').toArray()).filter((r) => !excluded.has(r.sessionId));
      setSolves(rows);
    };
    void load();
  }, [sessionId, revision, scope, excluded]);

  const splitAt = useMemo(() => Date.now() - WINDOWS.find((w) => w.id === window)!.ms, [window]);

  const times = useMemo(() => solves.map(effectiveTime), [solves]);
  /**
   * Each solve with its reading, kept side by side.
   *
   * analyzeMany drops the ones it cannot read, so its result cannot be indexed
   * against the solves it came from — pairing them by position would file every
   * CMLL under the wrong date and the wrong session.
   */
  const paired = useMemo(
    () =>
      solves.map((s) => ({
        solve: s,
        a: s.penalty === 'DNF' ? null : analyzeSolveRecord(s, settings),
      })),
    [solves, settings],
  );
  const analyses = useMemo(
    () => paired.map((p) => p.a).filter((a): a is NonNullable<typeof a> => !!a && a.complete),
    [paired],
  );
  const steps = useMemo(() => aggregateSteps(analyses), [analyses]);
  const insights = useMemo(() => buildInsights(analyses), [analyses]);

  /**
   * Every CMLL met in these solves.
   *
   * Read back out of the solves rather than stored beside them, so a change to
   * how a solve is read changes the history too and there is no second copy to
   * drift.
   */
  const encounters = useMemo(
    () =>
      paired.flatMap(({ solve, a }) => {
        if (!a || !a.complete) return [];
        const e = cmllEncounterOf(a, solve.date, solve.sessionId);
        return e ? [e] : [];
      }),
    [paired],
  );

  const ao5s = useMemo(() => rollingAverage(times, 5), [times]);
  const ao12s = useMemo(() => rollingAverage(times, 12), [times]);

  const trendData = useMemo(
    () =>
      solves.map((_, i) => ({
        i: i + 1,
        time: isFinite(times[i]) ? times[i] / 1000 : null,
        ao5: ao5s[i] && isFinite(ao5s[i]!) ? ao5s[i]! / 1000 : null,
        ao12: ao12s[i] && isFinite(ao12s[i]!) ? ao12s[i]! / 1000 : null,
      })),
    [solves, times, ao5s, ao12s],
  );

  const stackData = useMemo(
    () =>
      analyses.map((a, i) => {
        const row: Record<string, number | string> = { i: i + 1 };
        for (const s of a.steps) row[s.key] = s.durationMs / 1000;
        return row;
      }),
    [analyses],
  );

  const histogram = useMemo(() => {
    const ok = times.filter(isFinite).map((t) => t / 1000);
    if (!ok.length) return [];
    const lo = Math.floor(Math.min(...ok));
    const hi = Math.ceil(Math.max(...ok));
    const bins = Math.min(18, Math.max(5, hi - lo));
    const w = (hi - lo) / bins || 1;
    const counts = new Array(bins).fill(0);
    for (const t of ok) counts[Math.min(bins - 1, Math.floor((t - lo) / w))]++;
    return counts.map((c, i) => ({ label: (lo + i * w).toFixed(1), count: c }));
  }, [times]);

  const stepKeys = steps.map((s) => s.key);
  const finite = times.filter(isFinite);

  if (!solves.length) {
    return (
      <div className="panel p-8 text-center">
        <h2 className="text-lg font-semibold">Nothing to analyse yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-400">
          Do a few solves on the Timer page.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          <button
            className={`btn !py-1 !text-[13px] ${scope === 'session' ? '!border-cube-blue !text-cube-blue' : ''}`}
            onClick={() => setScope('session')}
          >
            This session
          </button>
          <button
            className={`btn !py-1 !text-[13px] ${scope === 'all' ? '!border-cube-blue !text-cube-blue' : ''}`}
            onClick={() => setScope('all')}
          >
            All
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-md border border-ink-700">
            {WINDOWS.map((w) => (
              <button
                key={w.id}
                className={`px-2 py-0.5 text-[12px] transition-colors ${
                  window === w.id ? 'bg-ink-700 text-ink-100' : 'text-ink-500'
                }`}
                onClick={() => setWindow(w.id)}
                title="What counts as lately, when comparing against before"
              >
                {w.label}
              </button>
            ))}
          </div>
          <p className="text-[13px] text-ink-400">
            {analyses.length}/{solves.length} solves with move data
          </p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {([
          ['overview', 'Overview'],
          ['steps', 'Steps'],
          ['cmll', 'CMLL'],
          ['advice', 'What to work on'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={
              'shrink-0 rounded-md border px-3 py-1 text-[13px] transition-colors ' +
              (tab === id ? 'border-cube-blue bg-ink-800 text-ink-100' : 'border-ink-700 text-ink-400')
            }
          >
            {label}
          </button>
        ))}
      </div>

      {scope === 'all' && sessions.length > 1 && (
        <section className="panel px-4 py-3">
          <button
            className="text-[13px] text-ink-400 underline underline-offset-2"
            onClick={() => setShowSessions((v) => !v)}
          >
            {excluded.size === 0
              ? 'All sessions counted'
              : `${excluded.size} session${excluded.size > 1 ? 's' : ''} left out`}
          </button>
          {showSessions && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sessions.map((x) => {
                const on = x.countsForStats !== false;
                return (
                  <button
                    key={x.id}
                    onClick={() => {
                      if (x.id == null) return;
                      void db.sessions.update(x.id, { countsForStats: !on }).then(bump);
                    }}
                    className={
                      'rounded-full border px-2.5 py-1 text-[13px] transition-colors ' +
                      (on
                        ? 'border-cube-blue bg-[color-mix(in_srgb,var(--color-cube-blue)_18%,transparent)] text-ink-100'
                        : 'border-ink-700 text-ink-500 line-through')
                    }
                  >
                    {x.name}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* The headline numbers belong to the overview. Repeated above the
          per-case table they were a quarter of a phone's screen saying nothing
          about the thing being read. */}
      {tab === 'overview' && (
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Solves" value={String(solves.length)} />
        <Kpi label="Best" value={formatTime(finite.length ? Math.min(...finite) : NaN)} />
        <Kpi label="Current ao5" value={formatTime(averageOf(times.slice(-5)))} />
        <Kpi label="Current ao12" value={formatTime(averageOf(times.slice(-12)))} />
        <Kpi label="Best ao12" value={formatTime(bestAverage(times, 12))} />
        <Kpi label="Std dev" value={formatTime(stdevOf(times))} />
      </section>
      )}

      {tab === 'advice' && insights.length > 0 && (
        <section className="panel p-5">
          <h2 className="text-base font-semibold">What to work on</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {insights.slice(0, 6).map((ins, i) => (
              <li key={i} className="border-l-2 pl-3.5" style={{ borderColor: severityColor(ins.severity) }}>
                <p className="text-[15px] font-semibold">{ins.title}</p>
                <p className="mt-1 max-w-[70ch] text-sm text-ink-300">{ins.detail}</p>
                <p className="mt-1.5 max-w-[70ch] text-sm" style={{ color: severityColor(ins.severity) }}>
                  {ins.action}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'overview' && (
      <section className="panel p-5">
        <h2 className="mb-4 text-base font-semibold">Time across solves</h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="i" {...AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
            <YAxis {...AXIS} tickLine={false} axisLine={false} width={44} unit="s" />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => `Solve ${v}`} />
            <Line {...NO_ANIM} type="linear" dataKey="time" stroke="#4a5a6d" dot={{ r: 2, fill: '#73869b' }} strokeWidth={1} name="time" />
            <Line {...NO_ANIM} type="monotone" dataKey="ao5" stroke="#2f7ff2" dot={false} strokeWidth={2} name="ao5" connectNulls />
            <Line {...NO_ANIM} type="monotone" dataKey="ao12" stroke="#ffcf2e" dot={false} strokeWidth={2} name="ao12" connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </section>
      )}

      {tab === 'steps' && steps.length > 0 && (
        <>
          <section className="panel p-5">
            <h2 className="text-base font-semibold">Where the time goes</h2>
            <div className="mt-4 flex flex-col gap-3">
              {steps.map((s) => (
                <ShareBar key={s.key} step={s} />
              ))}
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="mb-4 text-base font-semibold">Solve structure over time</h2>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={stackData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="i" {...AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                <YAxis {...AXIS} tickLine={false} axisLine={false} width={44} unit="s" />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => `Solve ${v}`} />
                {stepKeys.map((k) => (
                  <Area
                    {...NO_ANIM}
                    key={k}
                    type="monotone"
                    dataKey={k}
                    stackId="1"
                    stroke={stepColor(k)}
                    strokeWidth={0.5}
                    fill={stepColor(k)}
                    fillOpacity={0.82}
                    name={steps.find((s) => s.key === k)?.label ?? k}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="panel p-5">
              <h2 className="mb-4 text-base font-semibold">Pauses per step</h2>
              <ResponsiveContainer width="100%" height={210}>
                <ComposedChart data={steps.map((s) => ({ name: s.label, key: s.key, v: Math.round(s.pauseRatio * 100), ref: Math.round(s.refPauseRatio * 100) }))} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="name" {...AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={0} tickFormatter={(v: string) => v.replace('LSE ', '')} />
                  <YAxis {...AXIS} tickLine={false} axisLine={false} width={44} unit="%" domain={[0, 'auto']} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar {...NO_ANIM} dataKey="v" name="you" radius={[3, 3, 0, 0]}>
                    {steps.map((s) => (
                      <Cell key={s.key} fill={stepColor(s.key)} />
                    ))}
                  </Bar>
                  <Line {...NO_ANIM} type="monotone" dataKey="ref" stroke="#8697a9" strokeDasharray="4 3" dot={false} name="reference" />
                </ComposedChart>
              </ResponsiveContainer>
            </section>

            <section className="panel p-5">
              <h2 className="mb-4 text-base font-semibold">Moves per step</h2>
              <div className="flex flex-col gap-2.5">
                {steps.map((s) => (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-[13px] text-ink-300">{s.label}</span>
                    <div className="relative h-4 flex-1 rounded-[3px] bg-ink-800">
                      <div
                        className="h-full rounded-[3px]"
                        style={{
                          width: `${Math.min(100, (s.meanMoves / Math.max(s.refMoves * 2, 1)) * 100)}%`,
                          background: stepColor(s.key),
                        }}
                      />
                      <span className="absolute top-0 h-full w-px bg-ink-300" style={{ left: '50%' }} />
                    </div>
                    <span className="tnum w-10 shrink-0 text-right font-mono text-[13px]">
                      {s.meanMoves.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}

      {tab === 'cmll' && <CmllCaseStats encounters={encounters} splitAt={splitAt} />}

      {tab === 'overview' && (
      <section className="panel p-5">
        <h2 className="mb-4 text-base font-semibold">Time distribution</h2>
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={histogram} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" {...AXIS} tickLine={false} axisLine={{ stroke: GRID }} unit="s" />
            <YAxis {...AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <ReferenceLine x={(meanOf(times) / 1000).toFixed(1)} stroke="#ffcf2e" />
            <Bar {...NO_ANIM} dataKey="count" fill="#2f7ff2" radius={[3, 3, 0, 0]} name="solves" />
          </BarChart>
        </ResponsiveContainer>
      </section>
      )}
    </div>
  );
}

function severityColor(s: string) {
  return s === 'high' ? '#e0384f' : s === 'medium' ? '#ffcf2e' : s === 'good' ? '#17b26a' : '#8697a9';
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel px-3.5 py-3">
      <p className="text-[13px] text-ink-400">{label}</p>
      <p className="tnum mt-0.5 font-mono text-xl">{value}</p>
    </div>
  );
}

function ShareBar({ step }: { step: ReturnType<typeof aggregateSteps>[number] }) {
  const max = Math.max(step.share, step.refShare) * 1.35;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-[13px] text-ink-300">{step.label}</span>
      <div className="relative h-5 flex-1 overflow-hidden rounded-[3px] bg-ink-800">
        <div
          className="h-full"
          style={{ width: `${(step.share / max) * 100}%`, background: stepColor(step.key) }}
        />
        <span
          className="absolute top-0 h-full w-0.5 bg-ink-200"
          style={{ left: `${(step.refShare / max) * 100}%` }}
          title={`reference ${Math.round(step.refShare * 100)}%`}
        />
      </div>
      <span className="tnum w-11 shrink-0 text-right font-mono text-[13px]">{Math.round(step.share * 100)}%</span>
      <span className="tnum w-14 shrink-0 text-right font-mono text-[13px] text-ink-400">
        {(step.meanMs / 1000).toFixed(2)}s
      </span>
    </div>
  );
}
