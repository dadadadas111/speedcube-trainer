/**
 * How each CMLL case actually goes for you, read out of real solves.
 *
 * Recognition and execution are kept apart all the way through, because they
 * are different problems with different cures: a case you turn slowly needs the
 * algorithm working on, and a case you look at for a second and a half before
 * moving needs recognition work, which drilling the algorithm harder will not
 * touch. An average of the two hides exactly the thing worth knowing.
 */

import { useEffect, useMemo, useState } from 'react';
import { db, type AlgEntry } from '../store/db';
import { SEED_ALGS } from '../data/seedAlgs';
import { classifyCornerAlg } from '../analysis/cornerCase';
import { parseAlg } from '../cube/alg';
import { summariseCases, suggestCases, trendAround, type Encounter } from '../analysis/cmllStats';
import { formatSeconds } from '../analysis/stats';

const REASON: Record<string, { label: string; tone: string; why: string }> = {
  unseen: { label: 'never met', tone: 'text-warn', why: 'You have not run into this one yet' },
  hesitant: { label: 'recognition', tone: 'text-warn', why: 'You spend longer looking than turning' },
  slow: { label: 'slow', tone: 'text-bad', why: 'Slower than your other cases' },
};

export default function CmllCaseStats({
  encounters,
  splitAt,
}: {
  encounters: Encounter[];
  /** Solves from this moment on count as "lately" */
  splitAt: number;
}) {
  const [algs, setAlgs] = useState<AlgEntry[]>([]);
  useEffect(() => {
    void db.algs.where('group').equals('CMLL').toArray().then(setAlgs);
  }, []);

  /**
   * Case signature -> what to call it.
   *
   * The built-in set underneath and your own library on top, because the
   * library is only seeded when the Drill page is first opened — and a case met
   * in a solve deserves a name whether or not you have been there yet.
   */
  const named = useMemo(() => {
    const m = new Map<string, { family: string; name: string }>();
    for (const a of [...SEED_ALGS.filter((x) => x.group === 'CMLL'), ...algs]) {
      try {
        const c = classifyCornerAlg(parseAlg(a.alg));
        if (c) m.set(c.full, { family: a.family, name: a.name });
      } catch {
        /* an alg that will not parse simply names nothing */
      }
    }
    return m;
  }, [algs]);

  const stats = useMemo(() => summariseCases(encounters), [encounters]);
  const suggestions = useMemo(
    () => suggestCases(stats, [...named.keys()], 4),
    [stats, named],
  );
  const trend = useMemo(() => trendAround(encounters, splitAt), [encounters, splitAt]);

  const label = (full: string) => {
    const a = named.get(full);
    return a ? `${a.family} · ${a.name}` : full;
  };

  if (!encounters.length) {
    return (
      <section className="panel p-5">
        <h2 className="text-base font-semibold">CMLL cases</h2>
        <p className="mt-2 max-w-[60ch] text-sm text-ink-400">
          Nothing yet. Solve with a smart cube and every CMLL you run into is counted here — which case, how long
          you looked at it, and how long the turning took.
        </p>
      </section>
    );
  }

  return (
    <>
      {(trend || suggestions.length > 0) && (
        <section className="panel p-5">
          <h2 className="text-base font-semibold">Worth drilling</h2>
          {trend && (
            <p className="mt-2 text-[13px] text-ink-400">
              CMLL lately{' '}
              <span className="tnum font-mono text-ink-100">{formatSeconds(trend.recentMs)}s</span> against{' '}
              <span className="tnum font-mono text-ink-300">{formatSeconds(trend.earlierMs)}s</span> before —{' '}
              <span className={trend.deltaMs <= 0 ? 'text-good' : 'text-warn'}>
                {trend.deltaMs <= 0 ? '' : '+'}
                {formatSeconds(trend.deltaMs)}s
              </span>{' '}
              <span className="text-ink-500">
                ({trend.recentCount} and {trend.earlierCount} solves)
              </span>
            </p>
          )}
          {suggestions.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {suggestions.map((s) => (
                <li key={s.full} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                  <span className="font-semibold text-ink-100">{label(s.full)}</span>
                  <span className={REASON[s.reason].tone}>{REASON[s.reason].label}</span>
                  <span className="text-ink-500">{REASON[s.reason].why}</span>
                  {s.stats && (
                    <span className="tnum ml-auto font-mono text-ink-400">
                      {formatSeconds(s.stats.medianRecognitionMs)}s + {formatSeconds(s.stats.medianExecutionMs)}s
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="panel overflow-hidden">
        <header className="flex items-baseline justify-between border-b border-ink-700 px-4 py-3">
          <h2 className="text-sm font-semibold">CMLL cases</h2>
          <span className="text-[12px] text-ink-500">
            {stats.length} met · slowest first
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Case</th>
                <th className="text-right">Met</th>
                <th className="text-right">Look</th>
                <th className="text-right">Turn</th>
                <th className="text-right">Total</th>
                <th className="text-right">Best</th>
                <th className="text-right">Moves</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.full}>
                  <td className="whitespace-nowrap">{label(s.full)}</td>
                  <td className="tnum text-right">{s.count}</td>
                  {/* Looking and turning side by side, never added up: which of
                      the two is the slow one is the whole answer. */}
                  <td
                    className={`tnum text-right font-mono ${
                      s.medianRecognitionMs > s.medianExecutionMs ? 'text-warn' : 'text-ink-400'
                    }`}
                  >
                    {formatSeconds(s.medianRecognitionMs)}
                  </td>
                  <td className="tnum text-right font-mono text-ink-400">{formatSeconds(s.medianExecutionMs)}</td>
                  <td className="tnum text-right font-mono text-ink-100">{formatSeconds(s.medianTotalMs)}</td>
                  <td className="tnum text-right font-mono text-ink-500">{formatSeconds(s.bestTotalMs)}</td>
                  <td className="tnum text-right text-ink-500">{s.medianMoves}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
