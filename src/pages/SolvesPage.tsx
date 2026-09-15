import { useEffect, useMemo, useState } from 'react';
import { useApp, type Settings } from '../store/app';
import { db, type Penalty, type Solve, removeSynced } from '../store/db';
import { analyzeSolveRecord } from '../analysis/pipeline';
import { effectiveTime, formatTime } from '../analysis/stats';
import StepRibbon from '../components/StepRibbon';

type SortKey = 'date' | 'time';

export default function SolvesPage({ onOpenSolve }: { onOpenSolve: (id: number) => void }) {
  const { sessionId, settings, revision, bump } = useApp();
  const [solves, setSolves] = useState<Solve[]>([]);
  const [sort, setSort] = useState<SortKey>('date');
  const [onlyAnalyzed, setOnlyAnalyzed] = useState(false);

  useEffect(() => {
    void db.solves.where('sessionId').equals(sessionId).sortBy('date').then((r) => setSolves(r.reverse()));
  }, [sessionId, revision]);

  const rows = useMemo(() => {
    let r = solves;
    if (onlyAnalyzed) r = r.filter((s) => s.moves?.length);
    if (sort === 'time') r = [...r].sort((a, b) => effectiveTime(a) - effectiveTime(b));
    return r;
  }, [solves, sort, onlyAnalyzed]);

  const setPenalty = async (s: Solve, penalty: Penalty) => {
    if (!s.id) return;
    await db.solves.update(s.id, { penalty });
    bump();
  };
  const remove = async (s: Solve) => {
    if (!s.id) return;
    await removeSynced('solves', s.id);
    bump();
  };

  if (!solves.length) {
    return <p className="panel p-8 text-center text-sm text-ink-400">No solves in this session yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          <button
            className={`btn !py-1 !text-[13px] ${sort === 'date' ? '!border-cube-blue !text-cube-blue' : ''}`}
            onClick={() => setSort('date')}
          >
            Newest
          </button>
          <button
            className={`btn !py-1 !text-[13px] ${sort === 'time' ? '!border-cube-blue !text-cube-blue' : ''}`}
            onClick={() => setSort('time')}
          >
            Fastest
          </button>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-300">
          <input type="checkbox" checked={onlyAnalyzed} onChange={(e) => setOnlyAnalyzed(e.target.checked)} />
          Only solves with move data
        </label>
        <span className="ml-auto text-[13px] text-ink-400">{rows.length} solve</span>
      </div>

      <section className="panel overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th className="w-[34%]">Step split</th>
              <th className="text-right">Moves</th>
              <th className="text-right">TPS</th>
              <th className="text-right">Pauses</th>
              <th>At</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <Row
                key={s.id}
                solve={s}
                index={sort === 'date' ? solves.length - i : i + 1}
                settings={settings}
                onOpen={() => s.id && onOpenSolve(s.id)}
                onPenalty={(p) => void setPenalty(s, p)}
                onRemove={() => void remove(s)}
              />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Row({
  solve,
  index,
  settings,
  onOpen,
  onPenalty,
  onRemove,
}: {
  solve: Solve;
  index: number;
  settings: Settings;
  onOpen: () => void;
  onPenalty: (p: Penalty) => void;
  onRemove: () => void;
}) {
  const a = useMemo(() => analyzeSolveRecord(solve, settings), [solve, settings]);
  return (
    <tr>
      <td className="tnum text-ink-500">{index}</td>
      <td>
        <button className="tnum font-mono text-[15px] hover:text-cube-blue" onClick={onOpen}>
          {solve.penalty === 'DNF' ? <span className="text-bad">DNF</span> : formatTime(effectiveTime(solve))}
        </button>
      </td>
      <td>
        {a ? (
          <button className="block w-full" onClick={onOpen}>
            <StepRibbon steps={a.steps} totalMs={a.totalMs} height={8} />
          </button>
        ) : (
          <span className="text-[12px] text-ink-500">hand timed</span>
        )}
      </td>
      <td className="tnum text-right">{a ? a.totalMoves : '—'}</td>
      <td className="tnum text-right">{a ? a.tps.toFixed(1) : '—'}</td>
      <td className="tnum text-right">
        {a ? (
          <span className={a.pauseRatio > 0.35 ? 'text-warn' : ''}>{Math.round(a.pauseRatio * 100)}%</span>
        ) : (
          '—'
        )}
      </td>
      <td className="whitespace-nowrap text-[13px] text-ink-400">
        {new Date(solve.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
      </td>
      <td>
        <div className="flex justify-end gap-1">
          <button
            className={`btn !px-1.5 !py-0.5 !text-[12px] ${solve.penalty === '+2' ? '!border-warn !text-warn' : ''}`}
            onClick={() => onPenalty(solve.penalty === '+2' ? 'none' : '+2')}
          >
            +2
          </button>
          <button
            className={`btn !px-1.5 !py-0.5 !text-[12px] ${solve.penalty === 'DNF' ? '!border-bad !text-bad' : ''}`}
            onClick={() => onPenalty(solve.penalty === 'DNF' ? 'none' : 'DNF')}
          >
            DNF
          </button>
          <button className="btn btn-ghost !px-1.5 !py-0.5 !text-[12px] hover:!text-bad" onClick={onRemove} title="Delete">
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}
