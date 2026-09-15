/**
 * How you actually do on each CMLL case, gathered from real solves.
 *
 * A drill tells you how fast you are at a case you knew was coming. A solve
 * tells you how fast you are at one you did not — and those are different
 * numbers, because recognition is most of the difference. Both are worth
 * keeping, so both are counted here, and which one a figure came from is kept
 * alongside it rather than averaged away.
 *
 * Nothing is stored. Every number here is read back out of the solves and reps
 * that were already being kept, which means a change to how a solve is read
 * changes the history too, and there is no second copy to fall out of step.
 */

import { classifyCornerState, describeFamily } from './cornerCase';
import type { SolveAnalysis } from './solve';

/** One meeting with a CMLL case, from a solve or from the drill. */
export interface Encounter {
  /** The case signature — the same one the algorithm library is keyed by */
  full: string;
  /** The orientation family (O, H, Pi, ...) as the classifier reads it */
  family: string;
  at: number;
  recognitionMs: number;
  executionMs: number;
  moves: number;
  /** Where it happened. A drilled case was expected; a solved one was not. */
  source: 'solve' | 'drill';
  sessionId?: number;
}

/**
 * The CMLL case a solve ran into, and what it cost.
 *
 * The state at the moment the step began is the case: both blocks are standing
 * and the corners have not been touched yet. Recognition is the pause before
 * the first turn of the step, which the step analysis already separates out,
 * because that pause IS the recognition — it is the whole reason the two halves
 * are worth splitting.
 */
export function cmllEncounterOf(a: SolveAnalysis, at: number, sessionId?: number): Encounter | null {
  const step = a.steps.find((s) => s.key === 'CMLL');
  if (!step || !step.detected || step.moveCount === 0) return null;
  const state = a.states[step.startIndex];
  if (!state) return null;
  const c = classifyCornerState(state, a.colors);
  if (!c) return null;
  // The corners were already done — nothing was recognised and nothing solved
  if (c.full === '00000000') return null;
  return {
    full: c.full,
    family: c.family,
    at,
    recognitionMs: step.leadMs,
    executionMs: Math.max(0, step.durationMs - step.leadMs),
    moves: step.moveCount,
    source: 'solve',
    sessionId,
  };
}

export interface CaseStats {
  full: string;
  family: string;
  /** How it reads in words, when no algorithm in the library claims it */
  describe: string;
  count: number;
  medianRecognitionMs: number;
  medianExecutionMs: number;
  medianTotalMs: number;
  bestTotalMs: number;
  medianMoves: number;
  /** Most recent first */
  lastAt: number;
}

const median = (xs: number[]): number => {
  if (!xs.length) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** Medians rather than means: one fumbled attempt should not define a case. */
export function summariseCases(encounters: Encounter[]): CaseStats[] {
  const byCase = new Map<string, Encounter[]>();
  for (const e of encounters) {
    if (!byCase.has(e.full)) byCase.set(e.full, []);
    byCase.get(e.full)!.push(e);
  }
  return [...byCase.entries()]
    .map(([full, es]) => {
      const totals = es.map((e) => e.recognitionMs + e.executionMs);
      const family = es[0].family;
      return {
        full,
        family,
        describe: describeFamily(family),
        count: es.length,
        medianRecognitionMs: median(es.map((e) => e.recognitionMs)),
        medianExecutionMs: median(es.map((e) => e.executionMs)),
        medianTotalMs: median(totals),
        bestTotalMs: Math.min(...totals),
        medianMoves: median(es.map((e) => e.moves)),
        lastAt: Math.max(...es.map((e) => e.at)),
      };
    })
    .sort((a, b) => b.medianTotalMs - a.medianTotalMs);
}

export interface Trend {
  recentMs: number;
  earlierMs: number;
  /** Negative is faster than before */
  deltaMs: number;
  recentCount: number;
  earlierCount: number;
}

/**
 * Lately against before, rather than an average of everything.
 *
 * An all-time average of a thing you are getting better at is a number that
 * mostly describes how bad you used to be, and it moves slower the longer you
 * keep going — which is exactly backwards. Splitting at a date answers the
 * question actually being asked, which is whether the work is paying.
 *
 * Both halves need enough attempts to mean anything; a single fast one is luck.
 */
export function trendAround(encounters: Encounter[], splitAt: number, least = 3): Trend | null {
  const recent: number[] = [];
  const earlier: number[] = [];
  for (const e of encounters) {
    (e.at >= splitAt ? recent : earlier).push(e.recognitionMs + e.executionMs);
  }
  if (recent.length < least || earlier.length < least) return null;
  const r = median(recent);
  const p = median(earlier);
  return { recentMs: r, earlierMs: p, deltaMs: r - p, recentCount: recent.length, earlierCount: earlier.length };
}

export interface Suggestion {
  full: string;
  reason: 'slow' | 'unseen' | 'hesitant';
  /** Higher means more worth drilling */
  weight: number;
  stats: CaseStats | null;
}

/**
 * Which cases are worth an hour of drilling.
 *
 * Three reasons, and they are not the same problem. A case you have never met
 * is a hole — you will meet it eventually and have nothing. A case you are slow
 * at overall needs the algorithm working on. A case where the LOOKING is the
 * slow part needs recognition work instead, and drilling the algorithm harder
 * will not touch it. Saying which of the three it is matters more than the
 * ranking does.
 */
export function suggestCases(
  stats: CaseStats[],
  allCases: string[],
  limit = 5,
): Suggestion[] {
  const seen = new Map(stats.map((s) => [s.full, s]));
  const out: Suggestion[] = [];

  for (const full of allCases) {
    if (full === '00000000' || seen.has(full)) continue;
    out.push({ full, reason: 'unseen', weight: 1e9, stats: null });
  }

  const totals = stats.map((s) => s.medianTotalMs).sort((a, b) => a - b);
  const typical = totals.length ? totals[totals.length >> 1] : 0;
  for (const s of stats) {
    if (s.count < 2) continue;
    // Recognition running past execution is a looking problem, not a turning one
    const hesitant = s.medianRecognitionMs > s.medianExecutionMs;
    const over = s.medianTotalMs - typical;
    if (over <= 0 && !hesitant) continue;
    out.push({
      full: s.full,
      reason: hesitant ? 'hesitant' : 'slow',
      weight: Math.max(over, 0) + (hesitant ? s.medianRecognitionMs - s.medianExecutionMs : 0),
      stats: s,
    });
  }

  return out.sort((a, b) => b.weight - a.weight).slice(0, limit);
}
