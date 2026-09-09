/** WCA-style statistics: trimmed averages, means, best, standard deviation. */

export interface TimedSolveLike {
  timeMs: number;
  penalty: 'none' | '+2' | 'DNF';
}

export const DNF = Number.POSITIVE_INFINITY;

export function effectiveTime(s: TimedSolveLike): number {
  if (s.penalty === 'DNF') return DNF;
  return s.penalty === '+2' ? s.timeMs + 2000 : s.timeMs;
}

/** WCA average: drop the best and worst; a DNF counts as the worst. */
export function averageOf(times: number[]): number {
  const n = times.length;
  if (n < 3) return NaN;
  const dnfs = times.filter((t) => !isFinite(t)).length;
  if (dnfs > 1) return DNF;
  const sorted = [...times].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, n - 1);
  if (trimmed.some((t) => !isFinite(t))) return DNF;
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

export function meanOf(times: number[]): number {
  const ok = times.filter((t) => isFinite(t));
  if (!ok.length) return NaN;
  return ok.reduce((a, b) => a + b, 0) / ok.length;
}

export function stdevOf(times: number[]): number {
  const ok = times.filter((t) => isFinite(t));
  if (ok.length < 2) return NaN;
  const m = meanOf(ok);
  return Math.sqrt(ok.reduce((a, b) => a + (b - m) ** 2, 0) / (ok.length - 1));
}

/** Rolling average of the last n solves, at every point. `times` is chronological. */
export function rollingAverage(times: number[], n: number): (number | null)[] {
  return times.map((_, i) => (i + 1 < n ? null : averageOf(times.slice(i + 1 - n, i + 1))));
}

export function bestAverage(times: number[], n: number): number {
  let best = DNF;
  for (let i = 0; i + n <= times.length; i++) {
    const a = averageOf(times.slice(i, i + n));
    if (a < best) best = a;
  }
  return best;
}

export function formatTime(ms: number, showMs = true): string {
  if (Number.isNaN(ms)) return '—';
  if (!isFinite(ms)) return 'DNF';
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = (total % 60000) / 1000;
  const sStr = showMs ? s.toFixed(2).padStart(m ? 5 : 1, '0') : Math.round(s).toString();
  return m ? `${m}:${sStr}` : sStr;
}

export function formatSeconds(ms: number, digits = 2): string {
  if (Number.isNaN(ms)) return '—';
  if (!isFinite(ms)) return 'DNF';
  return (ms / 1000).toFixed(digits);
}

export function percentile(xs: number[], p: number): number {
  const ok = xs.filter((x) => isFinite(x)).sort((a, b) => a - b);
  if (!ok.length) return NaN;
  const idx = (ok.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? ok[lo] : ok[lo] + (ok[hi] - ok[lo]) * (idx - lo);
}
