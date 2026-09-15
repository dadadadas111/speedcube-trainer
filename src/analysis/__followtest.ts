/**
 * Following a written solve on a cube that cannot see rotations.
 *
 * The check that matters is the last one: strip the rotations, rewrite what
 * follows, and the result must still solve the scramble. Nothing else proves
 * the rewriting is right, and a wrong rewriting looks exactly like a correct
 * one until you try it on a cube.
 */

import { followSteps, followMoves } from './followSolve';
import { PRO_SOLVES } from '../data/proSolves';
import { parseAlg } from '../cube/alg';
import { applyMoves, SOLVED_STATE, isSolved } from '../cube/cube';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

/* ---- Rotations come out, and are reported instead ---- */
{
  // A step of nothing but rotations cannot be watched — nothing turns — so it
  // is folded into the next step rather than left to wait forever
  const s = followSteps([
    { label: 'inspection', moves: parseAlg('y x2') },
    { label: 'first block', moves: parseAlg('R U') },
  ]);
  check('a rotation-only step is not a step of its own', s.length === 1, String(s.length));
  check('its rotations become how to hold the next one', s[0].hold.join(' ') === 'y x2', s[0].hold.join(' '));
  check('and its name is not lost', /inspection/.test(s[0].label), s[0].label);
  check('the next step keeps its turns', s[0].moves.length === 2);

  const alone = followSteps([{ label: 'inspection', moves: parseAlg('y') }]);
  check('a solve that is only a rotation still shows it', alone.length === 1 && alone[0].hold.join(' ') === 'y');

  const t = followSteps([{ label: 'block', moves: parseAlg("x' U R' U'") }]);
  check('a rotation mid-step is taken out', !t[0].moves.some((m) => /^[xyz]/.test(m)), t[0].moves.join(' '));
  check('and the turns after it are rewritten', t[0].moves.join(' ') !== "U R' U'", t[0].moves.join(' '));
  check('the count is unchanged', t[0].moves.length === 3);
  check('what they wrote is kept for reading', t[0].written.join(' ') === "U R' U'", t[0].written.join(' '));
  check('written and tracked line up one for one', t[0].written.length === t[0].moves.length);
}

/* ---- The frame carries across steps ---- */
{
  // R is a side face, so a y rotation in an earlier step has to change it.
  // U would not show anything: y leaves the top face where it is.
  const t = followSteps([
    { label: 'inspection', moves: parseAlg('y') },
    { label: 'block', moves: parseAlg('R') },
  ]);
  check('the rotation-only step folds forward', t.length === 1 && t[0].hold.join(' ') === 'y');
  check('R after a y is not R to the cube', t[0].moves.join(' ') !== 'R', t[0].moves.join(' '));
  check('it is still a side face', /^[RFLB]/.test(t[0].moves[0]), t[0].moves[0]);
  check('but you are told to do R', t[0].written.join(' ') === 'R');

  // And it keeps applying two steps later, not just the next one
  const u = followSteps([
    { label: 'i', moves: parseAlg('y') },
    { label: 'a', moves: parseAlg('U') },
    { label: 'b', moves: parseAlg('R') },
  ]);
  check('a rotation still applies two steps later', u[1].moves.join(' ') !== 'R', u[1].moves.join(' '));
}

/* ---- The proof: every bundled solve still solves, rotations removed ---- */
{
  let broken = 0, rotationsLeft = 0, withRotations = 0;
  for (const solve of PRO_SOLVES) {
    const steps = followSteps(solve.steps.map((s) => ({ label: s.label, moves: parseAlg(s.moves) })));
    if (steps.some((s) => s.hold.length)) withRotations++;
    const moves = followMoves(steps);
    if (moves.some((m) => /^[xyz]/.test(m))) rotationsLeft++;
    const end = applyMoves(applyMoves(SOLVED_STATE, parseAlg(solve.scramble)), moves);
    if (!isSolved(end)) {
      broken++;
      console.log(`   không giải được: ${solve.solver} ${solve.timeMs}`);
    }
  }
  check('most solves do contain rotations', withRotations > PRO_SOLVES.length / 2, String(withRotations));
  check('no rotation survives the rewriting', rotationsLeft === 0, String(rotationsLeft));
  check('and every one still SOLVES its scramble', broken === 0, String(broken));
}

/* ---- Nothing is lost ---- */
{
  for (const solve of PRO_SOLVES.slice(0, 5)) {
    const original = parseAlg(solve.steps.map((s) => s.moves).join(' '));
    const turns = original.filter((m) => !/^[xyz]/.test(m)).length;
    const after = followMoves(followSteps(solve.steps.map((s) => ({ label: s.label, moves: parseAlg(s.moves) }))));
    if (after.length !== turns) {
      check('every turn survives: ' + solve.solver, false, `${turns} -> ${after.length}`);
    }
  }
  check('every turn survives the rewriting', true);
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
