/**
 * Rating every move of a solve, the way a chess game review does — except the
 * scale is FAST/SLOW rather than good/bad. The app has no idea which move was a
 * good choice, but it knows precisely which one was slower than your own usual
 * pace.
 *
 * The baseline comes from your own history, with three levels of fallback:
 *   1. That exact move pair (e.g. "R' -> U2") — the closest fit, needs samples.
 *   2. The face pair (e.g. "R -> U") — sparser data, so it pools more samples.
 *   3. The current step (FB, SB, CMLL...), and finally all history.
 *
 * So "slow" means slow for you in that specific situation, not slow against some
 * generic number.
 */

import type { SolveAnalysis, StepAnalysis } from './solve';
import { moveFace } from '../cube/alg';

/** Below this there are too few samples to trust as a baseline of its own. */
const MIN_TRANSITION_SAMPLES = 6;
const MIN_FACE_SAMPLES = 10;
const MIN_STEP_SAMPLES = 12;
/** Absurd gaps (a bluetooth drop, putting the cube down) never feed the baseline. */
const MAX_SANE_GAP_MS = 6000;

export type MoveVerdict = 'very fast' | 'fast' | 'normal' | 'slow' | 'stuck';

export interface MoveBaseline {
  transition: Map<string, number>;
  facePair: Map<string, number>;
  step: Map<string, number>;
  overall: number;
  /** Total number of move-to-move gaps that built the baseline */
  samples: number;
  /** How many solves contributed */
  solves: number;
}

export interface MoveRating {
  index: number;
  move: string;
  prevMove: string | null;
  deltaMs: number;
  baselineMs: number;
  /** deltaMs / baselineMs — 1 means exactly your usual pace */
  ratio: number;
  verdict: MoveVerdict;
  /** Milliseconds lost against the baseline; only counted for slow moves */
  lostMs: number;
  basis: 'move pair' | 'face pair' | 'step' | 'all history';
  stepKey: string;
  stepLabel: string;
}

export interface SolveReview {
  ratings: MoveRating[];
  /** Total time lost on the unusually slow moves */
  lostMs: number;
  /** What the solve would have been at your usual pace on those moves */
  potentialMs: number;
  slowest: MoveRating[];
  fastest: MoveRating[];
  /** How many solves built the baseline — too few and the rating is shaky */
  baselineSolves: number;
  reliable: boolean;
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function push(map: Map<string, number[]>, key: string, value: number) {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

function medianMap(map: Map<string, number[]>, minSamples: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, v] of map) if (v.length >= minSamples) out.set(k, median(v));
  return out;
}

function stepAt(a: SolveAnalysis, moveIndex: number): StepAnalysis | undefined {
  return a.steps.find((s) => moveIndex > s.startIndex && moveIndex <= s.endIndex);
}

export function buildMoveBaseline(analyses: SolveAnalysis[]): MoveBaseline {
  const transition = new Map<string, number[]>();
  const facePair = new Map<string, number[]>();
  const step = new Map<string, number[]>();
  const all: number[] = [];

  for (const a of analyses) {
    for (let i = 1; i < a.moves.length; i++) {
      const delta = a.moves[i].t - a.moves[i - 1].t;
      if (delta <= 0 || delta > MAX_SANE_GAP_MS) continue;
      const prev = a.moves[i - 1].move;
      const cur = a.moves[i].move;
      push(transition, prev + '>' + cur, delta);
      push(facePair, moveFace(prev) + '>' + moveFace(cur), delta);
      const s = stepAt(a, i);
      if (s) push(step, s.key, delta);
      all.push(delta);
    }
  }

  return {
    transition: medianMap(transition, MIN_TRANSITION_SAMPLES),
    facePair: medianMap(facePair, MIN_FACE_SAMPLES),
    step: medianMap(step, MIN_STEP_SAMPLES),
    overall: all.length ? median(all) : NaN,
    samples: all.length,
    solves: analyses.length,
  };
}

function verdictFor(ratio: number): MoveVerdict {
  if (ratio < 0.65) return 'very fast';
  if (ratio < 0.9) return 'fast';
  if (ratio < 1.5) return 'normal';
  if (ratio < 2.5) return 'slow';
  return 'stuck';
}

/** Only from here up does a move count as lost time; below is normal variance. */
const LOST_FROM_RATIO = 1.5;

export function reviewSolve(analysis: SolveAnalysis, baseline: MoveBaseline): SolveReview {
  // With no history, fall back to this solve's own median so we can still point
  // out which moves stand out against the rest of the run.
  const fallback = isFinite(baseline.overall)
    ? baseline.overall
    : median(analysis.moves.slice(1).map((m, i) => m.t - analysis.moves[i].t).filter((d) => d > 0));

  const ratings: MoveRating[] = [];
  for (let i = 1; i < analysis.moves.length; i++) {
    const prev = analysis.moves[i - 1].move;
    const cur = analysis.moves[i].move;
    const delta = analysis.moves[i].t - analysis.moves[i - 1].t;
    const step = stepAt(analysis, i);

    let baseMs = baseline.transition.get(prev + '>' + cur);
    let basis: MoveRating['basis'] = 'move pair';
    if (baseMs === undefined) {
      baseMs = baseline.facePair.get(moveFace(prev) + '>' + moveFace(cur));
      basis = 'face pair';
    }
    if (baseMs === undefined && step) {
      baseMs = baseline.step.get(step.key);
      basis = 'step';
    }
    if (baseMs === undefined) {
      baseMs = fallback;
      basis = 'all history';
    }
    if (!isFinite(baseMs) || baseMs <= 0) baseMs = Math.max(1, fallback || 1);

    const ratio = delta / baseMs;
    ratings.push({
      index: i,
      move: cur,
      prevMove: prev,
      deltaMs: delta,
      baselineMs: baseMs,
      ratio,
      verdict: verdictFor(ratio),
      lostMs: ratio >= LOST_FROM_RATIO ? delta - baseMs : 0,
      basis,
      stepKey: step?.key ?? '',
      stepLabel: step?.label ?? '',
    });
  }

  const lostMs = ratings.reduce((sum, r) => sum + r.lostMs, 0);
  const byRatio = [...ratings].sort((a, b) => b.ratio - a.ratio);

  return {
    ratings,
    lostMs,
    potentialMs: Math.max(0, analysis.totalMs - lostMs),
    slowest: byRatio.filter((r) => r.lostMs > 0).slice(0, 5),
    fastest: byRatio.slice(-3).reverse().filter((r) => r.ratio < 0.9),
    baselineSolves: baseline.solves,
    reliable: baseline.solves >= 10 && baseline.samples >= 300,
  };
}

export const VERDICT_COLORS: Record<MoveVerdict, string> = {
  'very fast': '#17b26a',
  fast: '#5fc48f',
  normal: '#5d6d80',
  slow: '#ffcf2e',
  stuck: '#e0384f',
};
