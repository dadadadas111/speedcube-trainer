/**
 * Improvement advice: compare each step's share of the solve against a
 * reference profile, then separate the cause into recognition/lookahead (lots of
 * pausing), execution (low TPS), or efficiency (too many moves).
 */

import type { SolveAnalysis } from './solve';
import type { MethodName } from './method';
import { meanOf, stdevOf } from './stats';

export interface StepProfile {
  /** Expected share of the total solve time */
  share: number;
  /** Expected average move count (STM) */
  moves: number;
  /** Acceptable fraction of the step spent paused */
  pauseRatio: number;
}

/** Reference profile for an intermediate solver (~20-30s). */
export const REFERENCE: Record<MethodName, Record<string, StepProfile>> = {
  roux: {
    FB: { share: 0.2, moves: 8, pauseRatio: 0.25 },
    SB: { share: 0.3, moves: 12, pauseRatio: 0.3 },
    CMLL: { share: 0.22, moves: 10, pauseRatio: 0.3 },
    EO: { share: 0.12, moves: 7, pauseRatio: 0.25 },
    LR: { share: 0.09, moves: 6, pauseRatio: 0.2 },
    L4C: { share: 0.07, moves: 5, pauseRatio: 0.15 },
  },
  cfop: {
    CROSS: { share: 0.12, moves: 7, pauseRatio: 0.2 },
    F2L1: { share: 0.12, moves: 7, pauseRatio: 0.3 },
    F2L2: { share: 0.12, moves: 7, pauseRatio: 0.3 },
    F2L3: { share: 0.13, moves: 7, pauseRatio: 0.3 },
    F2L4: { share: 0.13, moves: 7, pauseRatio: 0.3 },
    OLL: { share: 0.18, moves: 10, pauseRatio: 0.3 },
    PLL: { share: 0.2, moves: 13, pauseRatio: 0.25 },
  },
};

export interface StepAggregate {
  key: string;
  label: string;
  hint: string;
  meanMs: number;
  stdevMs: number;
  share: number;
  refShare: number;
  meanMoves: number;
  refMoves: number;
  tps: number;
  pauseRatio: number;
  refPauseRatio: number;
  /** Seconds lost per solve against the reference profile */
  excessMs: number;
  samples: number;
}

export interface Insight {
  severity: 'high' | 'medium' | 'low' | 'good';
  step: string;
  title: string;
  detail: string;
  action: string;
  /** Ranking weight (seconds lost) */
  weight: number;
}

export function aggregateSteps(analyses: SolveAnalysis[]): StepAggregate[] {
  if (!analyses.length) return [];
  const method = analyses[0].method;
  const ref = REFERENCE[method];
  const byKey = new Map<string, SolveAnalysis['steps']>();
  for (const a of analyses) {
    if (a.method !== method) continue;
    for (const s of a.steps) {
      if (!s.detected) continue;
      if (!byKey.has(s.key)) byKey.set(s.key, []);
      byKey.get(s.key)!.push(s);
    }
  }
  const totalMean = meanOf(analyses.map((a) => a.totalMs));
  const out: StepAggregate[] = [];
  for (const [key, list] of byKey) {
    if (!list.length) continue;
    const meanMs = meanOf(list.map((s) => s.durationMs));
    const meanMoves = meanOf(list.map((s) => s.moveCount));
    const pauseRatio = meanOf(list.map((s) => (s.durationMs > 0 ? s.pauseMs / s.durationMs : 0)));
    const r = ref[key] ?? { share: 1 / byKey.size, moves: meanMoves, pauseRatio: 0.3 };
    out.push({
      key,
      label: list[0].label,
      hint: list[0].hint,
      meanMs,
      stdevMs: stdevOf(list.map((s) => s.durationMs)),
      share: totalMean > 0 ? meanMs / totalMean : 0,
      refShare: r.share,
      meanMoves,
      refMoves: r.moves,
      tps: meanMs > 0 ? (meanMoves / meanMs) * 1000 : 0,
      pauseRatio,
      refPauseRatio: r.pauseRatio,
      excessMs: totalMean * (meanMs / Math.max(1, totalMean) - r.share),
      samples: list.length,
    });
  }
  return out;
}

const secs = (ms: number) => (ms / 1000).toFixed(2) + 's';
const pct = (x: number) => Math.round(x * 100) + '%';

export function buildInsights(analyses: SolveAnalysis[]): Insight[] {
  const steps = aggregateSteps(analyses);
  if (!steps.length) return [];
  const insights: Insight[] = [];
  const totalMean = meanOf(analyses.map((a) => a.totalMs));

  for (const s of steps) {
    const overShare = s.share - s.refShare;
    const excessSec = overShare * totalMean;

    if (overShare > 0.04) {
      // Work out the cause
      const pauseHeavy = s.pauseRatio > s.refPauseRatio + 0.08;
      const moveHeavy = s.meanMoves > s.refMoves * 1.25;
      const slowHands = s.tps < 3.2 && !pauseHeavy;
      let detail: string;
      let action: string;
      if (pauseHeavy) {
        detail = `Takes ${pct(s.share)} of the solve (reference ${pct(s.refShare)}). ${pct(s.pauseRatio)} of this step is spent standing still looking at the cube — the bottleneck is recognition and lookahead, not hand speed.`;
        action = s.key === 'CMLL' || s.key === 'OLL' || s.key === 'PLL'
          ? 'Go to Drill and practise this step\'s algs on their own. Target: recognise the case in under 0.5s.'
          : 'Do slow solves: turn at 40% speed but NEVER pause. That forces your eyes to look ahead.';
      } else if (moveHeavy) {
        detail = `Takes ${pct(s.share)} of the solve and averages ${s.meanMoves.toFixed(1)} moves (reference ~${s.refMoves}). Your hands are not slow — the solutions are roundabout.`;
        action = 'Replay your slow solves and look for a shorter solution to the same situation. Practise finding several options during inspection.';
      } else if (slowHands) {
        detail = `Takes ${pct(s.share)} of the solve at only ${s.tps.toFixed(1)} TPS with few pauses — the limit here is execution speed and finger tricks.`;
        action = 'Drill the algs against a TPS target and watch your regrips. For block building, smooth out the R U and M U pairs.';
      } else {
        detail = `Takes ${pct(s.share)} of the solve, above the reference ${pct(s.refShare)}.`;
        action = 'Practise this step in isolation: time just this step for 20 or more reps.';
      }
      insights.push({
        severity: overShare > 0.09 ? 'high' : 'medium',
        step: s.label,
        title: `${s.label} is your biggest bottleneck (about ${secs(excessSec)} lost per solve)`,
        detail,
        action,
        weight: excessSec,
      });
    }

  }

  // Report only ONE unstable step, the worst. Listing all four is just noise.
  const unstable = steps
    .filter((s) => s.samples >= 8 && s.stdevMs > s.meanMs * 0.55 && s.meanMs > 1500)
    .sort((a, b) => b.stdevMs - a.stdevMs)[0];
  if (unstable) {
    insights.push({
      severity: 'medium',
      step: unstable.label,
      title: `${unstable.label} is your least consistent step`,
      detail: `Averages ${secs(unstable.meanMs)} with a standard deviation of ${secs(unstable.stdevMs)}. Some cases you handle cleanly and others stop you dead — the problem is specific cases, not the step as a whole.`,
      action: 'Open the solve list, sort by time, and replay your slowest few to find the case that keeps costing you.',
      weight: unstable.stdevMs * 0.5,
    });
  }

  // Whole-solve observations
  const meanPauseRatio = meanOf(analyses.map((a) => a.pauseRatio));
  if (meanPauseRatio > 0.35) {
    insights.push({
      severity: 'high',
      step: 'Whole solve',
      title: `${pct(meanPauseRatio)} of every solve is spent standing still`,
      detail: `You pause for ${secs(meanPauseRatio * totalMean)} in an average solve. Solvers at your speed usually pause around 20-30% of the time.`,
      action: 'Top priority: train lookahead. Controlled slow solves beat trying to turn faster.',
      weight: (meanPauseRatio - 0.28) * totalMean,
    });
  } else if (meanPauseRatio < 0.22) {
    insights.push({
      severity: 'good',
      step: 'Whole solve',
      title: 'Good lookahead',
      detail: `Only ${pct(meanPauseRatio)} of the time is spent still — your solves flow well.`,
      action: 'You can now push TPS and learn more algs without breaking your rhythm.',
      weight: 0,
    });
  }

  const meanTps = meanOf(analyses.map((a) => a.tps));
  if (meanTps < 3 && meanPauseRatio < 0.3) {
    insights.push({
      severity: 'medium',
      step: 'Whole solve',
      title: `Average TPS is only ${meanTps.toFixed(1)}`,
      detail: 'You rarely pause but your hands are slow — execution speed is the current ceiling.',
      action: 'Drill algs against a TPS target, and study your grips and regrips in the replay.',
      weight: 500,
    });
  }

  const meanMoves = meanOf(analyses.map((a) => a.totalMoves));
  const moveBudget = analyses[0].method === 'roux' ? 50 : 58;
  if (meanMoves > moveBudget * 1.2) {
    insights.push({
      severity: 'medium',
      step: 'Whole solve',
      title: `${meanMoves.toFixed(0)} moves per solve on average — rather many`,
      detail: `${analyses[0].method === 'roux' ? 'Roux' : 'CFOP'} solvers usually land around ${moveBudget} moves. Every extra move costs roughly 0.2-0.3s.`,
      action: 'Work on efficiency rather than speed: solve slowly and hunt for the shorter solution.',
      weight: (meanMoves - moveBudget) * 250,
    });
  }

  return insights.sort((a, b) => {
    if ((a.severity === 'good') !== (b.severity === 'good')) return a.severity === 'good' ? 1 : -1;
    return b.weight - a.weight;
  });
}
