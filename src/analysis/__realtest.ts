/**
 * Regression test on a REAL Roux solve pulled off the cube over bluetooth.
 *
 * The synthetic tests missed the slice-merging bug because their two halves of
 * each M move were ~250ms apart and so never reached the merge window. A real
 * cube reports them 6-121ms apart, and that is when the bug shows: merging
 * R + L' into M while forgetting the x' term of M = R L' x' rotated the model,
 * while every later move was still applied in the old frame — the state was
 * wrecked and no step was ever detected.
 */

import { SOLVED_STATE, applyMoves, isSolved, stateSequence } from '../cube/cube';
import { parseAlg } from '../cube/alg';
import { cleanMoveStream } from '../cube/moveStream';
import { detectStages, scanStages, ROUX_STAGES } from './method';
import { analyzeSolve } from './solve';
import { REAL_SOLVE, REAL_SOLVE_2, REAL_SOLVE_3, realSolveMoves, parseMoves } from './fixtures/realSolve';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

const scramble = parseAlg(REAL_SOLVE.scramble);
const raw = realSolveMoves();
const start = applyMoves(SOLVED_STATE, scramble);

check('the source data is sound: the raw stream reaches a solved cube',
  isSolved(applyMoves(start, raw.map((m) => m.move))));

check('a real cube does report slice halves more than 45ms apart',
  (() => {
    const OPP: Record<string, string> = { R: 'L', L: 'R', U: 'D', D: 'U', F: 'B', B: 'F' };
    const gaps: number[] = [];
    for (let i = 0; i < raw.length - 1; i++)
      if (OPP[raw[i].move[0]] === raw[i + 1].move[0]) gaps.push(raw[i + 1].t - raw[i].t);
    return gaps.some((g) => g > 45);
  })());

// This is where the old bug died: after cleaning the stream the state must
// still be right (off by at most a whole-cube rotation, so isSolved holds).
for (const sliceWindow of [45, 80, 140, 200]) {
  const cleaned = cleanMoveStream(raw, { sliceWindow });
  const end = applyMoves(start, cleaned.map((m) => m.move));
  check(`cleaning the stream (${sliceWindow}ms window) keeps the state right`, isSolved(end));

  const det = detectStages(stateSequence(start, cleaned.map((m) => m.move)), ROUX_STAGES);
  const idx = det.map((d) => d.endIndex);
  check(`${sliceWindow}ms window: all six steps detected`, idx.every((i) => i > 0), idx.join(','));
  check(`${sliceWindow}ms window: steps are separate, not collapsed into one`,
    new Set(idx).size === 6, idx.join(','));
  check(`${sliceWindow}ms window: step order increases`,
    idx.every((v, i) => i === 0 || v > idx[i - 1]), idx.join(','));
}

// The whole analysis path, exactly as the UI uses it
{
  const a = analyzeSolve(scramble, cleanMoveStream(raw), REAL_SOLVE.timeMs, { method: 'roux' });
  check('the analysis reports itself complete', a.complete && a.warning === null, a.warning ?? '');
  check('every step is detected', a.steps.every((s) => s.detected));
  check('no step lasts zero seconds', a.steps.every((s) => s.durationMs > 0), a.steps.map((s) => Math.round(s.durationMs)).join(','));
  check('step durations add up to the solve time',
    Math.abs(a.steps.reduce((x, s) => x + s.durationMs, 0) - REAL_SOLVE.timeMs) < 200,
    String(a.steps.reduce((x, s) => x + s.durationMs, 0)));
  check('step move counts add up to the total', a.steps.reduce((x, s) => x + s.moveCount, 0) === a.totalMoves);
  check('TPS is sane for a 16.5 second solve', a.tps > 2 && a.tps < 9, a.tps.toFixed(2));
  console.log('   split:', a.steps.map((s) => `${s.key} ${(s.durationMs / 1000).toFixed(2)}s/${s.moveCount}n`).join('  '));
}

/**
 * The other half of the problem: which COLOURS the first block is built from.
 *
 * The cube reports its stickers in one fixed scheme, but the solver picks their
 * own block and holds the cube however they like, so the block they build can be
 * any of the twelve. Reading the state through a rotated frame does not help —
 * that moves the positions and leaves the colours pinned — so the detector used
 * to find nothing at all and drop all six steps onto the final move.
 */
for (const [name, solve] of [['solve 2', REAL_SOLVE_2], ['solve 3', REAL_SOLVE_3]] as const) {
  const scr = parseAlg(solve.scramble);
  const from = applyMoves(SOLVED_STATE, scr);
  const raw = parseMoves(solve.moves);
  check(`${name}: raw stream reaches a solved cube`, isSolved(applyMoves(from, raw.map((m) => m.move))));

  const cleaned = cleanMoveStream(raw);
  const states = stateSequence(from, cleaned.map((m) => m.move));

  // The old behaviour, kept here as the thing that must NOT come back
  const fixed = detectStages(states, ROUX_STAGES).map((d) => d.endIndex);
  check(`${name}: the app's own colour scheme really is the wrong one here`,
    new Set(fixed).size <= 2, fixed.join(','));

  const { detections } = scanStages(states, ROUX_STAGES);
  const idx = detections.map((d) => d.endIndex);
  check(`${name}: all six steps detected`, idx.every((i) => i > 0), idx.join(','));
  check(`${name}: steps are spread out, not piled on the last move`, new Set(idx).size >= 5, idx.join(','));
  check(`${name}: step order increases`, idx.every((v, i) => i === 0 || v >= idx[i - 1]), idx.join(','));
  check(`${name}: the first block is done in the first half of the solve`,
    idx[0] > 0 && idx[0] < cleaned.length / 2, `${idx[0]} of ${cleaned.length}`);

  const a = analyzeSolve(scr, cleaned, solve.timeMs, { method: 'roux' });
  check(`${name}: analysis is complete`, a.complete && a.warning === null, a.warning ?? '');
  check(`${name}: every step is detected`, a.steps.every((s) => s.detected));
  console.log('   split:', a.steps.map((s) => `${s.key} ${(s.durationMs / 1000).toFixed(2)}s/${s.moveCount}n`).join('  '));
}

/** A solve read in a rotated colour scheme must give the SAME boundaries. */
{
  const scr = parseAlg(REAL_SOLVE.scramble);
  const from = applyMoves(SOLVED_STATE, scr);
  const cleaned = cleanMoveStream(realSolveMoves());
  const states = stateSequence(from, cleaned.map((m) => m.move));
  const want = scanStages(states, ROUX_STAGES).detections.map((d) => d.endIndex);
  let ok = true;
  for (const rot of ['x', "y'", 'z2', 'x y']) {
    const turned = states.map((s) => applyMoves(s, rot.split(' ')));
    const got = scanStages(turned, ROUX_STAGES).detections.map((d) => d.endIndex);
    if (got.join(',') !== want.join(',')) { ok = false; console.log(`   ${rot}: ${got.join(',')} vs ${want.join(',')}`); }
  }
  check('solve 1: same boundaries whichever way the cube is held', ok, want.join(','));
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
