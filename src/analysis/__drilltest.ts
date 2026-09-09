import { SOLVED_STATE, applyMove, applyMoves, isSolved } from '../cube/cube';
import { parseAlg } from '../cube/alg';
import { simulateSensorStream } from '../cube/sensorSim';
import { DrillMatcher, caseStateFor, summarizeDrill } from './drill';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? ' <' + x + '>' : '')); } else console.log('ok   ' + n); };

// An algorithm with both a wide r and a slice M — Roux through and through
const alg = parseAlg("R U R' U' M' U R U' r'");
const caseState = caseStateFor(alg, SOLVED_STATE);
check('case state + algorithm = solved', isSolved(applyMoves(caseState, alg)));

// 1. Executed exactly as written
{
  const m = new DrillMatcher(alg, caseState);
  let s = caseState, t = 0;
  for (const mv of alg) { s = applyMove(s, mv); t += 200; m.feed(s, t); }
  check('matches when executed as written', m.done && m.mistakes === 0);
}

// 2. As the sensor reports it: M -> R then L', r -> L (with the frame shift)
{
  const reported = simulateSensorStream(alg);
  console.log('     solver:', alg.join(' '));
  console.log('     sensor:', reported.join(' '));
  const m = new DrillMatcher(alg, caseState);
  let s = caseState, t = 0;
  for (const mv of reported) { s = applyMove(s, mv); t += 150; m.feed(s, t); }
  check('ends solved', isSolved(s));
  check('matches when the sensor splits the M move', m.done, `final index, mistakes=${m.mistakes}`);
  check('no false mistake for a slice half', m.mistakes === 0, String(m.mistakes));
}

// 3. A wrong turn then a correction -> must count as a mistake
{
  const m = new DrillMatcher(alg, caseState);
  let s = caseState, t = 0;
  for (const mv of ['F', 'D', "D'", "F'"]) { s = applyMove(s, mv); t += 150; m.feed(s, t); }
  check('a real mistake is detected', m.mistakes >= 1, String(m.mistakes));
  for (const mv of alg) { s = applyMove(s, mv); t += 150; m.feed(s, t); }
  check('still completes after correcting', m.done);
}

// 4. Stats over many reps: move 4 is always slow -> it must be called out
{
  const reps = Array.from({ length: 12 }, (_, k) => {
    let t = 0;
    const moveTimes = alg.map((_, i) => (t += i === 4 ? 700 : 160 + (k % 3) * 10));
    return { date: k, recognitionMs: 800, execMs: t, moveTimes, extraMoves: 0, success: true };
  });
  const sum = summarizeDrill(alg, reps);
  check('all reps are counted', sum.reps === 12);
  check('points at the hesitant move', sum.worstMoves[0]?.index === 4, JSON.stringify(sum.worstMoves.map(w => w.index)));
  check('that move has a high hesitation score', (sum.worstMoves[0]?.hesitation ?? 0) > 3, String(sum.worstMoves[0]?.hesitation));
  check('the other moves are not flagged', sum.worstMoves.length === 1);
}
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
