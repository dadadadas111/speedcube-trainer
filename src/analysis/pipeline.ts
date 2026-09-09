/** Bridges a stored solve record to its analysis. */

import { parseAlg } from '../cube/alg';
import { cleanMoveStream } from '../cube/moveStream';
import type { Solve } from '../store/db';
import type { Settings } from '../store/app';
import { analyzeSolve, type SolveAnalysis } from './solve';

const cache = new Map<string, SolveAnalysis>();

function cacheKey(s: Solve, st: Settings): string {
  return [s.id ?? 'x', s.moves.length, s.timeMs, st.method, st.pauseMinMs, st.pauseFactor].join('|');
}

/** Returns null for hand-timed solves, which carry no move data. */
export function analyzeSolveRecord(solve: Solve, settings: Settings): SolveAnalysis | null {
  if (!solve.moves?.length) return null;
  const key = cacheKey(solve, settings);
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const result = analyzeSolve(parseAlg(solve.scramble), cleanMoveStream(solve.moves), solve.timeMs, {
      method: settings.method,
      minPauseMs: settings.pauseMinMs,
      pauseFactor: settings.pauseFactor,
    });
    if (cache.size > 400) cache.clear();
    cache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

export function analyzeMany(solves: Solve[], settings: Settings): SolveAnalysis[] {
  return solves
    .map((s) => (s.penalty === 'DNF' ? null : analyzeSolveRecord(s, settings)))
    .filter((a): a is SolveAnalysis => !!a && a.complete);
}
