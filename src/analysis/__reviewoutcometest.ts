/**
 * What the app says about a finished solve.
 *
 * The point of these is the shape of the feedback rather than the wording: that
 * both sides get said, that it covers the solve rather than one thing in it,
 * and that slow mode talks about the solution while speed mode talks about the
 * clock.
 */

import { parseAlg } from '../cube/alg';
import { cleanMoveStream } from '../cube/moveStream';
import { analyzeSolve } from './solve';
import { reviewSolveOutcome, topRemarks } from './review';
import { REAL_SOLVE, REAL_SOLVE_2, REAL_SOLVE_3, parseMoves } from './fixtures/realSolve';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

const solves = [['solve 1', REAL_SOLVE], ['solve 2', REAL_SOLVE_2], ['solve 3', REAL_SOLVE_3]] as const;

for (const [name, s] of solves) {
  const a = analyzeSolve(parseAlg(s.scramble), cleanMoveStream(parseMoves(s.moves)), s.timeMs, { method: 'roux' });

  for (const focus of ['speed', 'slow'] as const) {
    const shown = topRemarks(reviewSolveOutcome(a, focus));

    check(`${name} (${focus}): says more than one thing`, shown.length >= 3, String(shown.length));
    check(`${name} (${focus}): finds something that went right`,
      shown.some((r) => r.tone === 'good'), shown.map((r) => r.tone).join(','));
    check(`${name} (${focus}): does not gloss over what went wrong`,
      shown.some((r) => r.tone !== 'good'), shown.map((r) => r.tone).join(','));

    const good = shown.filter((r) => r.tone === 'good').length;
    check(`${name} (${focus}): neither side drowns out the other`,
      good >= 1 && good <= shown.length - 1, `${good} of ${shown.length}`);

    // One step said twice is one remark wasted
    const keys = shown.map((r) => r.key).filter(Boolean);
    check(`${name} (${focus}): no step is talked about twice`,
      new Set(keys).size === keys.length, keys.join(','));

    check(`${name} (${focus}): nothing is said blankly`, shown.every((r) => r.text.trim().length > 12));
  }

  // The two modes look at the same solve differently
  const speak = (f: 'speed' | 'slow') => topRemarks(reviewSolveOutcome(a, f)).map((r) => r.text).join(' ');
  check(`${name}: slow mode counts moves`, /move/.test(speak('slow')));
  check(`${name}: the two modes do not say the same thing`, speak('speed') !== speak('slow'));
}

/* ---- A solve with nothing to split is said plainly rather than praised ---- */
{
  const a = analyzeSolve(parseAlg("R U R'"), [], 1000, { method: 'roux' });
  const shown = topRemarks(reviewSolveOutcome(a));
  check('an unsplittable solve gets one honest remark', shown.length === 1, String(shown.length));
  check('and it is not dressed up as good', shown[0].tone !== 'good', shown[0].tone);
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
