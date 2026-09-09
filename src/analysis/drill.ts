/**
 * The matcher behind alg drilling.
 *
 * It matches on STATE, not on move names. The reason: the sensors report a wide
 * r as L, an M as two events R + L', and see no whole-cube rotations at all.
 * Comparing states through the rotation-invariant key accepts every equivalent
 * way of performing the alg.
 */

import { canonicalKey, applyMoves, stateSequence, type CubeState } from '../cube/cube';
import { invertAlg } from '../cube/alg';

export type DrillEvent = 'progress' | 'complete' | 'off-track' | 'back';

export interface DrillProgress {
  event: DrillEvent;
  /** How many moves have matched (0 = still at the case state) */
  index: number;
  /** When each move matched, measured from the first move (ms) */
  moveTimes: (number | null)[];
}

/** The case state is the inverse of the alg applied to a solved cube. */
export function caseStateFor(alg: string[], base: CubeState): CubeState {
  return applyMoves(base, invertAlg(alg));
}

export class DrillMatcher {
  private expectedKeys: string[];
  private matchedAt: (number | null)[];
  private index = 0;
  private t0: number | null = null;
  /** How many consecutive moves are currently off the alg */
  private offTrackRun = 0;
  /** Real mistakes, excluding an M turn split in two by the sensors */
  mistakes = 0;
  /** All off-alg moves, including slice-move halves */
  extraMoves = 0;

  constructor(
    private alg: string[],
    caseState: CubeState,
  ) {
    this.expectedKeys = stateSequence(caseState, alg).map(canonicalKey);
    this.matchedAt = new Array(alg.length + 1).fill(null);
    this.matchedAt[0] = 0;
  }

  get length() {
    return this.alg.length;
  }
  get done() {
    return this.index >= this.alg.length;
  }
  get startedAt() {
    return this.t0;
  }

  /** Feed the cube state after each move. `t` is an absolute timestamp (ms). */
  feed(state: CubeState, t: number): DrillProgress {
    const key = canonicalKey(state);
    // Prefer matching forwards, in case the alg revisits a state
    let found = -1;
    for (let i = this.index + 1; i < this.expectedKeys.length; i++) {
      if (this.expectedKeys[i] === key) {
        found = i;
        break;
      }
    }
    if (found < 0) {
      for (let i = 0; i <= this.index; i++) {
        if (this.expectedKeys[i] === key) {
          found = i;
          break;
        }
      }
      if (found >= 0 && found < this.index) {
        this.index = found;
        this.offTrackRun = 0;
        return { event: 'back', index: found, moveTimes: this.moveTimes() };
      }
      this.extraMoves++;
      this.offTrackRun++;
      // A single off move is usually just half a slice turn (the sensors report
      // M as R then L'), so only two or more in a row count as a mistake.
      if (this.offTrackRun === 2) this.mistakes++;
      return { event: 'off-track', index: this.index, moveTimes: this.moveTimes() };
    }
    this.offTrackRun = 0;
    if (this.t0 === null) this.t0 = t;
    for (let i = this.index + 1; i <= found; i++) this.matchedAt[i] = t - this.t0;
    this.index = found;
    return {
      event: this.done ? 'complete' : 'progress',
      index: found,
      moveTimes: this.moveTimes(),
    };
  }

  private moveTimes(): (number | null)[] {
    return this.matchedAt.slice(1);
  }
}

/* ---------- Aggregating many drill reps ---------- */

export interface DrillRepData {
  date: number;
  recognitionMs: number;
  execMs: number;
  /** When each move completed, measured from the first move (ms) */
  moveTimes: (number | null)[];
  extraMoves: number;
  success: boolean;
}

export interface MoveStat {
  index: number;
  move: string;
  /** Median gap from the previous move to this one (ms) */
  medianMs: number;
  p25Ms: number;
  p75Ms: number;
  bestMs: number;
  samples: number;
  /** medianMs over the alg's overall median — above 1.6 is a clear hesitation */
  hesitation: number;
}

export interface DrillSummary {
  reps: number;
  successRate: number;
  bestExecMs: number;
  medianExecMs: number;
  recentExecMs: number;
  medianRecognitionMs: number;
  tps: number;
  moveStats: MoveStat[];
  /** The moves most worth drilling again */
  worstMoves: MoveStat[];
  trend: { date: number; execMs: number }[];
}

function med(xs: number[]): number {
  if (!xs.length) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function quant(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  const i = (a.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (i - lo);
}

export function summarizeDrill(alg: string[], reps: DrillRepData[]): DrillSummary {
  const ok = reps.filter((r) => r.success);
  const deltasByIndex: number[][] = alg.map(() => []);
  for (const r of ok) {
    let prev = 0;
    for (let i = 0; i < alg.length; i++) {
      const t = r.moveTimes[i];
      if (t == null) {
        prev = NaN;
        continue;
      }
      if (!isNaN(prev)) deltasByIndex[i].push(t - prev);
      prev = t;
    }
  }
  const allDeltas = deltasByIndex.flat().filter((d) => d >= 0);
  const overallMed = med(allDeltas) || 1;

  const moveStats: MoveStat[] = alg.map((move, i) => {
    const ds = deltasByIndex[i].filter((d) => d >= 0);
    const m = med(ds);
    return {
      index: i,
      move,
      medianMs: m,
      p25Ms: quant(ds, 0.25),
      p75Ms: quant(ds, 0.75),
      bestMs: ds.length ? Math.min(...ds) : NaN,
      samples: ds.length,
      hesitation: isNaN(m) ? 0 : m / overallMed,
    };
  });

  const execs = ok.map((r) => r.execMs);
  const recent = ok.slice(-5).map((r) => r.execMs);
  const medianExec = med(execs);

  return {
    reps: reps.length,
    successRate: reps.length ? ok.length / reps.length : 0,
    bestExecMs: execs.length ? Math.min(...execs) : NaN,
    medianExecMs: medianExec,
    recentExecMs: med(recent),
    medianRecognitionMs: med(ok.map((r) => r.recognitionMs).filter((x) => x > 0)),
    tps: medianExec > 0 ? (alg.length / medianExec) * 1000 : 0,
    moveStats,
    worstMoves: [...moveStats]
      .filter((s) => s.index > 0 && s.samples >= 2 && s.hesitation > 1.5)
      .sort((a, b) => b.medianMs - a.medianMs)
      .slice(0, 3),
    trend: ok.map((r) => ({ date: r.date, execMs: r.execMs })),
  };
}
