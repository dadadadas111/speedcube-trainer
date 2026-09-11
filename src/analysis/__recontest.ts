import { SOLVED_STATE, applyMove, applyPerm, toKociemba } from '../cube/cube';
import { ROTATIONS, MOVE_PERMS, IDENTITY_PERM } from '../cube/geometry';
import { moveInFrame, rotationBetween, parseAlg } from '../cube/alg';
import { cleanMoveStream } from '../cube/moveStream';
import { analyzeSolve } from './solve';
import { reconstruct } from './reconstruction';
import { REAL_SOLVE, REAL_SOLVE_2, REAL_SOLVE_3, parseMoves } from './fixtures/realSolve';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

const probe = applyMove(applyMove(SOLVED_STATE, 'R'), 'U');

/* ---- Renaming a move for a different frame ---- */
{
  // Turning then looking must equal looking then turning the renamed move
  let bad: string[] = [];
  for (const rot of ROTATIONS) {
    for (const m of ['U', "R'", 'F2', 'M', "E'", 'S2', 'D', "L'", 'B2', "M'", 'E', 'S']) {
      const a = applyPerm(applyMove(probe, m), rot);
      const b = applyMove(applyPerm(probe, rot), moveInFrame(m, rot));
      if (toKociemba(a) !== toKociemba(b)) bad.push(`${m}->${moveInFrame(m, rot)}`);
    }
  }
  check('moveInFrame agrees with turning the cube, all 24 frames x 12 moves', bad.length === 0, bad.slice(0, 5).join(' '));
  check('the identity frame renames nothing',
    ['U', "R'", 'M2'].every((m) => moveInFrame(m, IDENTITY_PERM as Uint8Array) === m));
}

/* ---- Naming the rotation between two frames ---- */
{
  const ID = ROTATIONS.find((r) => r.every((v, i) => v === i))!;
  let bad = 0;
  for (const rot of ROTATIONS) {
    const names = rotationBetween(ID, rot);
    const viaName = names.reduce((s, n) => applyPerm(s, MOVE_PERMS[n]), applyPerm(probe, ID));
    if (toKociemba(viaName) !== toKociemba(applyPerm(probe, rot))) bad++;
  }
  check('every one of the 24 frames can be named as a rotation', bad === 0, String(bad));
  check('no rotation between a frame and itself', rotationBetween(ROTATIONS[5], ROTATIONS[5]).length === 0);
  check('at most two rotations are ever needed',
    ROTATIONS.every((r) => rotationBetween(ID, r).length <= 2));
}

/* ---- Real solves: the reconstruction has to read like one ---- */
for (const [name, solve] of [['solve 1', REAL_SOLVE], ['solve 2', REAL_SOLVE_2], ['solve 3', REAL_SOLVE_3]] as const) {
  const a = analyzeSolve(parseAlg(solve.scramble), cleanMoveStream(parseMoves(solve.moves)), solve.timeMs, { method: 'roux' });
  const steps = reconstruct(a);

  check(`${name}: every move lands in exactly one step`,
    steps.reduce((n, s) => n + s.moves.length, 0) === a.moves.length,
    `${steps.reduce((n, s) => n + s.moves.length, 0)} vs ${a.moves.length}`);
  check(`${name}: move indices are in order and unique`,
    steps.flatMap((s) => s.moves.map((m) => m.index)).every((v, i, arr) => i === 0 || v === arr[i - 1] + 1));

  // The whole point of reading LSE in the solver's frame: it comes out as M and U
  const lse = steps.filter((s) => s.key === 'EO' || s.key === 'LR').flatMap((s) => s.moves.map((m) => m.move));
  check(`${name}: LSE reads as M and U only`,
    lse.every((m) => m[0] === 'M' || m[0] === 'U'), lse.join(' '));

  // A rotation is only ever claimed between steps, never inside one
  check(`${name}: at most one rotation per step boundary`,
    steps.every((s) => s.rotation.length <= 2), steps.map((s) => s.rotation.join('')).join('|'));

  // The last step is just "solved", which says nothing about how the cube is
  // held — it must not invent a rotation of its own
  check(`${name}: no rotation claimed after the last real step`,
    steps.filter((s) => s.key !== 'after').slice(-1)[0].rotation.length === 0);
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
