/**
 * What to say about the solve that just finished.
 *
 * A review that only ever points at the worst thing is no use: you cannot tell
 * whether the rest went well, whether the thing being criticised is the thing
 * that actually cost you, or whether you have improved. So this collects
 * several remarks across the whole solve, keeps the good ones alongside the
 * bad, and orders them by how much they matter rather than by how bad they are.
 *
 * Everything is measured against the reference profile and against the step's
 * own share of the solve, so "good" means good for the pace you are solving at,
 * not good in the abstract.
 */

import { REFERENCE } from './recommend';
import { formatSeconds } from './stats';
import type { SolveAnalysis, StepAnalysis } from './solve';

export type Tone = 'good' | 'warn' | 'bad';

export interface Remark {
  text: string;
  tone: Tone;
  /** How much this is worth saying; the list comes back sorted by it */
  weight: number;
  /** The step it is about, for colouring */
  key?: string;
}

/** Slow mode cares about the shape of the solution; speed mode about the clock. */
export type ReviewFocus = 'speed' | 'slow';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const moves = (n: number) => `${n} ${n === 1 ? 'move' : 'moves'}`;

/**
 * What this solve "should" have taken in moves, summed over the steps that were
 * actually found. Shared so the headline figure and the remarks below it can
 * never quote different numbers for the same thing.
 */
export function parMoves(a: SolveAnalysis): number {
  const ref = REFERENCE[a.method] ?? {};
  return a.steps
    .filter((s) => s.detected && s.durationMs > 0)
    .reduce((n, s) => n + (ref[s.key]?.moves ?? s.moveCount), 0);
}

export function reviewSolveOutcome(a: SolveAnalysis, focus: ReviewFocus = 'speed'): Remark[] {
  const ref = REFERENCE[a.method] ?? {};
  const steps = a.steps.filter((s) => s.detected && s.durationMs > 0);
  if (!steps.length) {
    return [{ text: 'This solve could not be split into steps.', tone: 'warn', weight: 1 }];
  }

  const out: Remark[] = [];
  const refMovesTotal = parMoves(a);

  /* ---- how efficient the solution was ---- */
  const overall = a.totalMoves - refMovesTotal;
  if (refMovesTotal > 0) {
    if (overall <= -3) {
      out.push({
        text: `${moves(a.totalMoves)} — ${-overall} fewer than a typical solution.`,
        tone: 'good',
        weight: focus === 'slow' ? 9 : 5,
      });
    } else if (overall >= 6) {
      out.push({
        text: `${moves(a.totalMoves)}, ${overall} more than needed — the solution itself is what cost you.`,
        tone: 'warn',
        weight: focus === 'slow' ? 10 : 6,
      });
    }
  }

  /* ---- step by step: movecount, then time ---- */
  for (const s of steps) {
    const r = ref[s.key];
    if (!r) continue;
    const extra = s.moveCount - r.moves;
    if (extra >= 5) {
      // Say it differently depending on how far over, so four of these in a row
      // do not read as the same sentence copied out
      const text =
        s.moveCount >= r.moves * 2
          ? `${s.label} took ${moves(s.moveCount)}, twice what it usually needs.`
          : `${s.label} took ${moves(s.moveCount)} against about ${r.moves}.`;
      out.push({ text, tone: 'warn', weight: (focus === 'slow' ? 2.2 : 0.6) * extra, key: s.key });
    } else if (extra <= -2) {
      out.push({
        text: `${s.label} in ${moves(s.moveCount)}, ${-extra} under par.`,
        tone: 'good',
        weight: (focus === 'slow' ? 2.6 : 1.2) * -extra,
        key: s.key,
      });
    }

    // Things that went right and are easy to miss: a step nobody stopped in,
    // and one that was recognised the moment it appeared
    if (s.pauses.length === 0 && s.moveCount >= 4) {
      out.push({
        text: `${s.label} ran straight through without stopping.`,
        tone: 'good',
        weight: 4.5,
        key: s.key,
      });
    }
    if (s.leadMs > 0 && s.leadMs < 200 && s.moveCount >= 4) {
      out.push({
        text: `${s.label} was recognised straight away — ${Math.round(s.leadMs)}ms before the first turn.`,
        tone: 'good',
        weight: 4,
        key: s.key,
      });
    }

    const share = s.durationMs / a.totalMs;
    const overShare = share - r.share;
    if (overShare > 0.08) {
      out.push({
        text: `${s.label} ate ${pct(share)} of the solve, more than the ${pct(r.share)} it usually takes.`,
        tone: 'warn',
        weight: (focus === 'slow' ? 30 : 70) * overShare,
        key: s.key,
      });
    } else if (overShare < -0.03 && s.moveCount > 0) {
      out.push({
        text: `${s.label} went quickly — ${formatSeconds(s.durationMs)}s, ${pct(share)} of the solve.`,
        tone: 'good',
        weight: (focus === 'slow' ? 25 : 60) * -overShare,
        key: s.key,
      });
    }
  }

  /* ---- where the hands stopped ---- */
  const longest = a.longestPause;
  if (longest && longest.ms > 900) {
    const step = stepContaining(a.steps, longest.moveIndex);
    out.push({
      text: `${formatSeconds(longest.ms)}s stopped during ${step?.label ?? 'the solve'} — the longest pause this time.`,
      tone: longest.ms > 1800 ? 'bad' : 'warn',
      weight: focus === 'slow' ? 3 : longest.ms / 400,
      key: step?.key,
    });
  }

  if (a.pauseRatio < 0.2) {
    out.push({
      text: `Only ${pct(a.pauseRatio)} of the solve spent not turning — that is a smooth one.`,
      tone: 'good',
      weight: 5,
    });
  } else if (a.pauseRatio > 0.45) {
    out.push({
      text: `${pct(a.pauseRatio)} of the solve spent still — lookahead, not finger speed, is the limit here.`,
      tone: 'warn',
      weight: focus === 'slow' ? 3 : 6,
    });
  }

  /* ---- and how fast the hands were, when they were moving ---- */
  if (focus === 'speed' && a.tps > 0) {
    if (a.tps >= 5) out.push({ text: `${a.tps.toFixed(1)} turns per second overall.`, tone: 'good', weight: 3 });
    else if (a.tps < 2.5 && a.pauseRatio < 0.35) {
      out.push({ text: `${a.tps.toFixed(1)} TPS with few pauses — the turning itself is the slow part.`, tone: 'warn', weight: 4 });
    }
  }

  /**
   * Say something good if there is anything good to say. A review that is all
   * criticism gets ignored, and a solve with nothing at all to praise is rare
   * enough that it is worth finding the least bad step.
   */
  if (!out.some((r) => r.tone === 'good')) {
    const best = steps.reduce((a1, b) => {
      const sa = a1.durationMs / a.totalMs - (ref[a1.key]?.share ?? 0);
      const sb = b.durationMs / a.totalMs - (ref[b.key]?.share ?? 0);
      return sb < sa ? b : a1;
    });
    out.push({
      text: `${best.label} was the tidiest part: ${formatSeconds(best.durationMs)}s, ${moves(best.moveCount)}.`,
      tone: 'good',
      weight: 2,
      key: best.key,
    });
  }

  return out.sort((x, y) => y.weight - x.weight);
}

function stepContaining(steps: StepAnalysis[], moveIndex: number): StepAnalysis | undefined {
  return steps.find((s) => moveIndex >= s.startIndex && moveIndex < s.endIndex);
}

/**
 * The handful worth showing, taking from each side in turn.
 *
 * Sorting purely by weight buries the encouraging remarks under the critical
 * ones every time, because something going wrong always scores higher than
 * something going right. Alternating gives both sides the same footing, and
 * falls back to whichever side still has something to say.
 */
export function topRemarks(all: Remark[], limit = 4): Remark[] {
  const good = all.filter((r) => r.tone === 'good');
  const bad = all.filter((r) => r.tone !== 'good');
  const picked: Remark[] = [];
  const used = new Set<string>();

  // Two things about the same step reads as one thing said twice, so a step
  // gets one remark until every other step has had its turn.
  const take = (list: Remark[], fresh: boolean) =>
    list.find((r) => !picked.includes(r) && (!fresh || !r.key || !used.has(r.key)));

  for (let i = 0; picked.length < limit; i++) {
    const first = i % 2 === 0 ? bad : good;
    const second = i % 2 === 0 ? good : bad;
    const next =
      take(first, true) ?? take(second, true) ?? take(first, false) ?? take(second, false);
    if (!next) break;
    picked.push(next);
    if (next.key) used.add(next.key);
  }
  return picked.sort((x, y) => y.weight - x.weight);
}
