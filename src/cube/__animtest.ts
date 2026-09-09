import { MOVE_PERMS, FACELET_POS, FACELET_NORMAL, moveTurn, rotateVecDegrees } from './geometry';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };
const near = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

/**
 * The core check for the animation: turning the layer a full 90 (or 180) degrees
 * must land every facelet exactly where that move's permutation table says. A
 * wrong sign or axis makes the animation spin backwards, and this catches it.
 */
for (const move of ['R', "R'", 'R2', 'U', "U'", 'L', 'F', "B'", 'D2', 'M', "M'", 'M2', 'E', 'S', 'r', "l'", 'u']) {
  const turn = moveTurn(move);
  if (!turn) { check('move understood: ' + move, false); continue; }
  const perm = MOVE_PERMS[move];
  // out[j] = state[perm[j]], so the facelet at perm[j] moves into slot j
  let ok = true;
  let moved = 0;
  for (let j = 0; j < 54; j++) {
    const src = perm[j];
    const inLayer = turn.inLayer(src);
    if (!inLayer) { if (src !== j) ok = false; continue; }
    moved++;
    const p = rotateVecDegrees(FACELET_POS[src], turn.axis, turn.quarters * 90);
    const n = rotateVecDegrees(FACELET_NORMAL[src], turn.axis, turn.quarters * 90);
    if (!near(p, FACELET_POS[j]) || !near(n, FACELET_NORMAL[j])) ok = false;
  }
  check(`animating ${move.padEnd(3)} a full turn matches the permutation table (${moved} facelets)`, ok);
}

// Halfway through it must be in between, not already at the destination
{
  const turn = moveTurn('R')!;
  const f = FACELET_POS.findIndex((_, i) => turn.inLayer(i) && FACELET_NORMAL[i][2] === 1);
  const half = rotateVecDegrees(FACELET_POS[f], turn.axis, turn.quarters * 45);
  check('a half-completed turn puts the facelet between the two positions',
    !near(half, FACELET_POS[f]) && Math.abs(Math.hypot(...half) - Math.hypot(...FACELET_POS[f])) < 1e-6);
}
check('an unreadable move returns null', moveTurn('Z9') === null);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
