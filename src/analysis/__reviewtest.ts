import { IDENTITY_COLORS } from '../cube/cube';
import { buildMoveBaseline, reviewSolve } from './moveReview';
import type { SolveAnalysis } from './solve';
import type { StepAnalysis } from './solve';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

/** Build a minimal SolveAnalysis from a list of (move, gap from previous move). */
function fakeSolve(pairs: [string, number][], stepKey = 'SB'): SolveAnalysis {
  let t = 0;
  const moves = pairs.map(([move, d]) => ({ move, t: (t += d) }));
  const step: StepAnalysis = {
    key: stepKey, label: stepKey, hint: '', startIndex: 0, endIndex: moves.length,
    startMs: 0, endMs: t, durationMs: t, moveCount: moves.length, tps: 0,
    pauses: [], pauseMs: 0, rotation: null, frame: null, detected: true,
  };
  return {
    method: 'roux', steps: [step], states: [], moves, totalMs: t,
    totalMoves: moves.length, tps: 0, pauseMs: 0, pauseRatio: 0,
    longestPause: null, pauseThresholdMs: 250, complete: true, warning: null,
    colors: IDENTITY_COLORS,
  };
}

/** 20 "normal" solves of 20 moves each: R->U always 100ms, U->R always 300ms. */
const pattern: [string, number][] = [['R', 0]];
for (let i = 0; i < 10; i++) pattern.push(['U', 100], ['R', 300]);
const corpus = Array.from({ length: 20 }, () => fakeSolve(pattern));
const baseline = buildMoveBaseline(corpus);

check('baseline learns the R->U pair', baseline.transition.get('R>U') === 100, String(baseline.transition.get('R>U')));
check('baseline learns the U->R pair', baseline.transition.get('U>R') === 300, String(baseline.transition.get('U>R')));
check('overall baseline is the median of every gap', baseline.overall === 200, String(baseline.overall));
check('enough samples to be considered reliable', baseline.samples >= 300, String(baseline.samples));
check('solve count is right', baseline.solves === 20);

// The crux: 250ms is FAST for U->R but SLOW for R->U.
// A single overall number cannot tell those apart.
{
  const s = fakeSolve([['R', 0], ['U', 200], ['R', 200], ['U', 100]]);
  const r = reviewSolve(s, baseline);
  const rUtoR = r.ratings.find((x) => x.prevMove === 'R' && x.move === 'U')!;
  const rRtoU = r.ratings.find((x) => x.prevMove === 'U' && x.move === 'R')!;
  check('same 200ms: after R it counts as slow', rUtoR.verdict === 'slow', `${rUtoR.verdict} ratio=${rUtoR.ratio.toFixed(2)}`);
  check('same 200ms: after U it counts as fast', rRtoU.verdict === 'fast', `${rRtoU.verdict} ratio=${rRtoU.ratio.toFixed(2)}`);
  check('uses the move-pair baseline', rUtoR.basis === 'move pair' && rRtoU.basis === 'move pair');
}

// A real stall must be called out, with the lost time computed correctly
{
  const s = fakeSolve([['R', 0], ['U', 100], ['R', 300], ['U', 1600], ['R', 300], ['U', 100]]);
  const r = reviewSolve(s, baseline);
  const stuck = r.ratings.find((x) => x.deltaMs === 1600)!;
  check('the stalled move is flagged', stuck.verdict === 'stuck', `${stuck.verdict} ratio=${stuck.ratio}`);
  check('lost time = actual minus baseline', Math.round(r.lostMs) === 1500, String(r.lostMs));
  check('potential time = total minus what was lost', Math.round(r.potentialMs) === Math.round(s.totalMs - 1500));
  check('the slowest move heads the list', r.slowest[0] === stuck);
  check('normal moves lose no time',
    r.ratings.filter((x) => x !== stuck).every((x) => x.lostMs === 0));
}

// Faster than usual loses nothing, and gets recognised
{
  const s = fakeSolve([['R', 0], ['U', 50], ['R', 150], ['U', 50]]);
  const r = reviewSolve(s, baseline);
  check('faster than baseline -> nothing lost', r.lostMs === 0);
  check('fast moves are recorded', r.fastest.length > 0 && r.fastest[0].ratio < 0.9);
  check('potential equals the actual time', r.potentialMs === s.totalMs);
}

// An unseen move pair must fall back to a coarser baseline rather than break
{
  const s = fakeSolve([['F', 0], ['B2', 400]]);
  const r = reviewSolve(s, baseline);
  check('an unseen pair still gets rated', r.ratings.length === 1);
  check('and says it used a coarser baseline', r.ratings[0].basis !== 'move pair', r.ratings[0].basis);
}

// With no history it uses the solve itself as the baseline, and must not throw
{
  const empty = buildMoveBaseline([]);
  const s = fakeSolve([['R', 0], ['U', 100], ['R', 100], ['U', 900]]);
  const r = reviewSolve(s, empty);
  check('runs with no history', r.ratings.length === 3);
  check('and marks itself unreliable', !r.reliable);
  check('still spots the move far off the rest',
    r.ratings[2].verdict === 'stuck' || r.ratings[2].verdict === 'slow', r.ratings[2].verdict);
  check('enough history makes it reliable', reviewSolve(s, baseline).reliable);
}

// An absurd gap (a bluetooth dropout) must not poison the baseline
{
  const dirty = [...corpus, fakeSolve([['R', 0], ['U', 30000], ['R', 300]])];
  const b2 = buildMoveBaseline(dirty);
  check('absurd gaps are ignored when building the baseline', b2.transition.get('R>U') === 100, String(b2.transition.get('R>U')));
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
