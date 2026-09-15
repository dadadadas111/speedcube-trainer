/**
 * CMLL statistics: which case a real solve ran into, and what to make of a
 * pile of those.
 */

import { cmllEncounterOf, summariseCases, trendAround, suggestCases, type Encounter } from './cmllStats';
import { analyzeSolve } from './solve';
import { classifyCornerAlg } from './cornerCase';
import { parseAlg } from '../cube/alg';
import { cleanMoveStream } from '../cube/moveStream';
import { SEED_ALGS } from '../data/seedAlgs';
import { REAL_SOLVE, REAL_SOLVE_2, REAL_SOLVE_3, parseMoves } from './fixtures/realSolve';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

/** Every case the library knows, by signature. */
const LIBRARY = new Map(
  SEED_ALGS.filter((a) => a.group === 'CMLL').map((a) => [classifyCornerAlg(parseAlg(a.alg))!.full, a]),
);

/* ---- Real solves name a real case ---- */
{
  let found = 0;
  for (const solve of [REAL_SOLVE, REAL_SOLVE_2, REAL_SOLVE_3]) {
    const a = analyzeSolve(parseAlg(solve.scramble), cleanMoveStream(parseMoves(solve.moves)), solve.timeMs, {
      method: 'roux',
    });
    const e = cmllEncounterOf(a, Date.now());
    if (!e) { console.log('   không đọc được CMLL từ solve thật'); continue; }
    found++;
    const named = LIBRARY.get(e.full);
    check(
      `a real solve names a case in the library: ${named ? named.family + ' ' + named.name : e.full}`,
      !!named,
      e.full,
    );
    // recognition and execution are the two halves of the step, not extra
    const step = a.steps.find((s) => s.key === 'CMLL')!;
    check('  recognition + execution add up to the step', Math.abs(e.recognitionMs + e.executionMs - step.durationMs) < 1);
    check('  the move count is the step\'s', e.moves === step.moveCount);
  }
  check('all three real solves yield a CMLL case', found === 3, String(found));
}

/* ---- Summarising ---- */
{
  const mk = (full: string, at: number, rec: number, exec: number): Encounter =>
    ({ full, family: '0000', at, recognitionMs: rec, executionMs: exec, moves: 9, source: 'solve' });
  const es = [
    mk('A', 1, 400, 600), mk('A', 2, 600, 800), mk('A', 3, 500, 700),
    mk('B', 4, 100, 200),
  ];
  const stats = summariseCases(es);
  check('one row per case', stats.length === 2);
  const a = stats.find((s) => s.full === 'A')!;
  check('counts the meetings', a.count === 3);
  check('medians rather than means', a.medianRecognitionMs === 500 && a.medianExecutionMs === 700);
  check('total is the median of the totals', a.medianTotalMs === 1200, String(a.medianTotalMs));
  check('best is the fastest one', a.bestTotalMs === 1000, String(a.bestTotalMs));
  check('slowest case comes first', stats[0].full === 'A');
  check('remembers when it was last met', a.lastAt === 3);

  // A single wild attempt must not define a case
  const withOutlier = summariseCases([...es, mk('A', 5, 9000, 9000)]);
  check('one fumble barely moves the median', withOutlier.find((s) => s.full === 'A')!.medianTotalMs === 1300,
    String(withOutlier.find((s) => s.full === 'A')!.medianTotalMs));
}

/* ---- Lately against before ---- */
{
  const mk = (at: number, total: number): Encounter =>
    ({ full: 'A', family: '0000', at, recognitionMs: 0, executionMs: total, moves: 9, source: 'solve' });
  const es = [mk(1, 2000), mk(2, 2200), mk(3, 1800), mk(10, 1000), mk(11, 1200), mk(12, 1100)];
  const t = trendAround(es, 10)!;
  check('splits at the date given', t.recentCount === 3 && t.earlierCount === 3);
  check('reads the recent half', t.recentMs === 1100, String(t.recentMs));
  check('and the earlier one', t.earlierMs === 2000, String(t.earlierMs));
  check('faster than before is negative', t.deltaMs === -900, String(t.deltaMs));
  check('too little on one side says nothing', trendAround(es, 12) === null);
  check('nor with nothing at all', trendAround([], 10) === null);
}

/* ---- What to drill ---- */
{
  const stat = (full: string, count: number, rec: number, exec: number) =>
    ({ full, family: '0000', describe: '', count, medianRecognitionMs: rec, medianExecutionMs: exec,
       medianTotalMs: rec + exec, bestTotalMs: rec + exec, medianMoves: 9, lastAt: 1 });
  const stats = [
    stat('fast', 5, 200, 500),
    stat('typical', 5, 300, 700),
    stat('slow', 5, 400, 2000),
    stat('hesitant', 5, 1200, 300),
    stat('once', 1, 5000, 5000),
  ];
  const sug = suggestCases(stats, ['fast', 'typical', 'slow', 'hesitant', 'once', 'never', '00000000'], 10);
  const by = new Map(sug.map((s) => [s.full, s]));
  check('a case never met comes top', sug[0].full === 'never' && sug[0].reason === 'unseen');
  check('the solved case is never suggested', !by.has('00000000'));
  check('a slow case is called slow', by.get('slow')?.reason === 'slow');
  check('looking longer than turning is called hesitant', by.get('hesitant')?.reason === 'hesitant');
  check('a case met once is not judged', !by.has('once'));
  check('a fast case is left alone', !by.has('fast'));
  check('the limit is obeyed', suggestCases(stats, ['never', 'also-never'], 1).length === 1);
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
