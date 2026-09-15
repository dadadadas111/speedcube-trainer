/**
 * The bundled pro solves, checked again here rather than only at the moment
 * they were fetched: the file is generated, and a generated file that quietly
 * stops being true is worse than one that was never checked.
 */
import { PRO_SOLVES } from './proSolves';
import { parseAlg } from '../cube/alg';
import { applyMoves, SOLVED_STATE, isSolved } from '../cube/cube';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

check('there are solves to follow', PRO_SOLVES.length > 20, String(PRO_SOLVES.length));

let unsolved = 0, unreadable = 0, unlabelled = 0, noTime = 0;
for (const s of PRO_SOLVES) {
  try {
    const moves = parseAlg(s.steps.map((x) => x.moves).join(' '));
    if (!isSolved(applyMoves(applyMoves(SOLVED_STATE, parseAlg(s.scramble)), moves))) unsolved++;
  } catch {
    unreadable++;
  }
  if (!s.steps.length || s.steps.some((x) => !x.label)) unlabelled++;
  if (!(s.timeMs > 0) || !s.solver) noTime++;
}
check('every solution reads as notation', unreadable === 0, String(unreadable));
check('every solution SOLVES its scramble', unsolved === 0, String(unsolved));
check('every step is named', unlabelled === 0, String(unlabelled));
check('every solve is attributed and timed', noTime === 0, String(noTime));

// Roux, every one of them. Filtering by solver name let CFOP solves through,
// because the people who are known for Roux do not only solve with Roux.
let notRoux = 0;
for (const s of PRO_SOLVES) {
  const labels = s.steps.map((x) => x.label.toLowerCase()).join(' ');
  if (!/cmll/.test(labels) || /\bcross\b/.test(labels)) {
    notRoux++;
    console.log('   không phải Roux:', s.solver, s.timeMs, labels);
  }
}
check('every solve is a Roux solve', notRoux === 0, String(notRoux));
check('several solvers are represented', new Set(PRO_SOLVES.map((s) => s.solver)).size >= 3);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
