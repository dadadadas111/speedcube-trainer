import { useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

/** Data charts do not need an entrance animation — it only delays reading. */
const NO_ANIM = { isAnimationActive: false } as const;
import { useApp } from '../store/app';
import { db, type Solve } from '../store/db';
import { analyzeMany } from '../analysis/pipeline';
import { aggregateSteps, buildInsights } from '../analysis/recommend';
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

export default function StatsPage() {
  const { sessionId, settings, revision } = useApp();
  const [solves, setSolves] = useState<Solve[]>([]);
  const [scope, setScope] = useState<'session' | 'all'>('session');

  useEffect(() => {
    const load = async () => {
      const rows =
        scope === 'session'
          ? await db.solves.where('sessionId').equals(sessionId).sortBy('date')
          : await db.solves.orderBy('date').toArray();
      setSolves(rows);
    };
    void load();
  }, [sessionId, revision, scope]);

  const times = useMemo(() => solves.map(effectiveTime), [solves]);
  const analyses = useMemo(() => analyzeMany(solves, settings), [solves, settings]);
  const steps = useMemo(() => aggregateSteps(analyses), [analyses]);
  const insights = useMemo(() => buildInsights(analyses), [analyses]);

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
        <p className="text-[13px] text-ink-400">
          {analyses.length}/{solves.length} solves with move data
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Solves" value={String(solves.length)} />
        <Kpi label="Best" value={formatTime(finite.length ? Math.min(...finite) : NaN)} />
        <Kpi label="Current ao5" value={formatTime(averageOf(times.slice(-5)))} />
        <Kpi label="Current ao12" value={formatTime(averageOf(times.slice(-12)))} />
        <Kpi label="Best ao12" value={formatTime(bestAverage(times, 12))} />
        <Kpi label="Std dev" value={formatTime(stdevOf(times))} />
      </section>

      {insights.length > 0 && (
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

      {steps.length > 0 && (
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
