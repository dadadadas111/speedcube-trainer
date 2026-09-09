import { SOLVED_STATE, applyMove, applyMoves, applyPerm, isSolved } from '../cube/cube';
import { ROTATIONS, MOVE_PERMS, composePerm, IDENTITY_PERM } from '../cube/geometry';

/** The permutation for a sequence of whole-cube rotations, e.g. "x y". */
function rotPerm(spec: string): Uint8Array {
  let p: Uint8Array = IDENTITY_PERM as Uint8Array;
  for (const m of spec.split(' ')) p = composePerm(p, MOVE_PERMS[m]);
  return p;
}
import { parseAlg, invertAlg } from '../cube/alg';
import { ScrambleTracker, isAtStart } from './scrambleGuide';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

const SCRAMBLE = parseAlg("R U' F2 D B' R2 U L' D2 F R2 B U2 L");

// 1. Turning each move correctly
{
  const t = new ScrambleTracker(SCRAMBLE);
  let s = SOLVED_STATE;
  check('start: no move turned yet', t.update(s).done === 0);
  check('the first hint is right', t.peek().next === SCRAMBLE[0], String(t.peek().next));
  let allOk = true;
  SCRAMBLE.forEach((m, i) => {
    s = applyMove(s, m);
    const p = t.update(s, m);
    if (p.done !== i + 1 || p.status === 'off-track') allOk = false;
    if (i < SCRAMBLE.length - 1 && p.next !== SCRAMBLE[i + 1]) allOk = false;
  });
  check('tracks correctly through the whole scramble', allOk);
  check('ends complete', t.peek().status === 'complete' && t.peek().next === null);
}

// 2. Holding the cube at an angle. Rotating the whole cube does NOT change the
//    physical state, only how the facelet array is written. The tracker must not care.
{
  const prefixes: Uint8Array[] = [SOLVED_STATE];
  SCRAMBLE.forEach((m) => prefixes.push(applyMove(prefixes[prefixes.length - 1], m)));
  for (const rot of ['y', "x'", 'z2', 'x y']) {
    const perm = ROTATIONS.find((r) => r.join() === rotPerm(rot).join())!;
    const t = new ScrambleTracker(SCRAMBLE);
    let ok = true;
    prefixes.forEach((p, i) => {
      const seen = applyPerm(p, perm);           // the same cube, held at an angle
      if (t.update(seen, SCRAMBLE[i - 1]).done !== i) ok = false;
    });
    check(`held at an angle (${rot}) still tracks`, ok && t.peek().status === 'complete');
  }
}

// 3. Turning the opposite face must be caught (the easiest mistake to make)
{
  const t = new ScrambleTracker(SCRAMBLE);
  const s = applyMove(SOLVED_STATE, 'L');   // the scramble starts with R
  const p = t.update(s, 'L');
  check('turning the opposite face -> off-track', p.status === 'off-track', p.status);
  check('the fix is to undo it', p.fix.join(' ') === "L'", p.fix.join(' '));
}

// 4. Right face, wrong direction: this is "part way through", not wrong.
//    Turning further completes it — no need to undo anything.
{
  const t = new ScrambleTracker(SCRAMBLE);
  const p = t.update(applyMove(SOLVED_STATE, "R'"), "R'");
  check('right face wrong direction -> partial', p.status === 'partial', p.status);
  check('says exactly what is left', p.remaining === 'R2', String(p.remaining));
}

// 5. Several wrong moves, then following the fix returns to the path
{
  const t = new ScrambleTracker(SCRAMBLE);
  let s = SOLVED_STATE;
  for (const m of SCRAMBLE.slice(0, 5)) { s = applyMove(s, m); t.update(s, m); }
  check('5 moves turned correctly', t.peek().done === 5);
  for (const m of ['F', 'D2', "B'"]) { s = applyMove(s, m); t.update(s, m); }
  const p = t.peek();
  check('3 wrong moves -> off-track', p.status === 'off-track' && p.wrongMoves === 3, `${p.status}/${p.wrongMoves}`);
  check('the fix undoes those 3 moves', p.fix.join(' ') === "B D2 F'", p.fix.join(' '));
  // follow the fix
  for (const m of p.fix) { s = applyMove(s, m); t.update(s, m); }
  const after = t.peek();
  check('after fixing, back where it was', after.status === 'on-track' && after.done === 5, `${after.status}/${after.done}`);
  check('and points at the right next move', after.next === SCRAMBLE[5], String(after.next));
  // finish the scramble
  for (const m of SCRAMBLE.slice(5)) { s = applyMove(s, m); t.update(s, m); }
  check('finishing the scramble completes it', t.peek().status === 'complete');
  check('the final state is exactly the scramble', applyMoves(SOLVED_STATE, SCRAMBLE).join() === s.join());
}

// 6. Going back: undoing a correct move lowers progress rather than erroring
{
  const t = new ScrambleTracker(SCRAMBLE);
  let s = SOLVED_STATE;
  for (const m of SCRAMBLE.slice(0, 4)) { s = applyMove(s, m); t.update(s, m); }
  s = applyMove(s, invertAlg([SCRAMBLE[3]])[0]);
  const p = t.update(s, invertAlg([SCRAMBLE[3]])[0]);
  check('undoing -> progress steps back, no error', p.status === 'on-track' && p.done === 3, `${p.status}/${p.done}`);
}

// 7. A dropout mid-scramble: with no idea what was turned, invent no fix
{
  const t = new ScrambleTracker(SCRAMBLE);
  const p = t.update(applyMoves(SOLVED_STATE, ['F', 'B', 'L2']));  // no move passed
  check('unknown turns -> still off-track', p.status === 'off-track');
  check('and no fix is invented', p.fix.length === 0);
}

// 8. isAtStart is invariant under orientation
{
  check('a solved cube is recognised at any angle',
    ['y', 'x2', "z' y"].every((r) => isAtStart(applyMoves(SOLVED_STATE, r.split(' ')))));
  check('an unsolved cube is not', !isAtStart(applyMove(SOLVED_STATE, 'R')));
  check('consistent with isSolved', isAtStart(SOLVED_STATE) === isSolved(SOLVED_STATE));
}

/* ---- Half turns: the cube reports two quarter events, and must not flash red in between ---- */
{
  const SCR = parseAlg("U2 R F2 L' D2 B");
  const t = new ScrambleTracker(SCR);
  let s = SOLVED_STATE;
  t.update(s);
  check('start: the next move is U2', t.peek().next === 'U2');

  // first half of U2
  s = applyMove(s, 'U');
  let p = t.update(s, 'U');
  check('half of U2 -> partial, NOT wrong', p.status === 'partial', p.status);
  check('and says what is left', p.remaining === 'U', String(p.remaining));
  check('progress has not moved', p.done === 0);

  // second half
  s = applyMove(s, 'U');
  p = t.update(s, 'U');
  check('completing it -> on track', p.status === 'on-track' && p.done === 1, `${p.status}/${p.done}`);
  check('and moves on to the next move', p.next === 'R');
}

/* ---- Right face, wrong direction is also "partial" ---- */
{
  const t = new ScrambleTracker(parseAlg("U2 R F2"));
  const p = t.update(applyMove(SOLVED_STATE, "U'"), "U'");
  check('U2 turned the wrong way -> still partial', p.status === 'partial', p.status);
  // U' has been turned; another U' makes the half turn
  check("one more U' to go", p.remaining === "U'", String(p.remaining));
}
{
  const t = new ScrambleTracker(parseAlg("R U F"));
  const p = t.update(applyMove(SOLVED_STATE, "R'"), "R'");
  check('a quarter turn the wrong way -> partial', p.status === 'partial', p.status);
  check('R2 to go', p.remaining === 'R2', String(p.remaining));
  // turn the rest
  const p2 = t.update(applyMove(applyMove(SOLVED_STATE, "R'"), 'R2'), 'R2');
  check('turning the rest makes it right', p2.status === 'on-track' && p2.done === 1, `${p2.status}/${p2.done}`);
}

/* ---- Only moving to another face while partial counts as wrong ---- */
{
  const t = new ScrambleTracker(parseAlg("U2 R F2"));
  let s = applyMove(SOLVED_STATE, 'U');
  check('half of U2 -> yellow', t.update(s, 'U').status === 'partial');
  s = applyMove(s, 'F');
  const p = t.update(s, 'F');
  check('touching another face -> now it is wrong', p.status === 'off-track', p.status);
  check('the fix includes the stray half U', p.fix.join(' ') === "F' U'", p.fix.join(' '));
}

/* ---- A completely different face from the start must still go red at once ---- */
{
  const t = new ScrambleTracker(parseAlg("U2 R F2"));
  check('a completely different face -> red immediately', t.update(applyMove(SOLVED_STATE, 'F'), 'F').status === 'off-track');
}

/* ---- An all-half-turn scramble, turned half at a time, must never go red ---- */
{
  const SCR = parseAlg("U2 R2 F2 L2 D2 B2");
  const t = new ScrambleTracker(SCR);
  let s = SOLVED_STATE;
  t.update(s);
  const seen: string[] = [];
  for (const m of SCR) {
    const half = m[0];
    for (let k = 0; k < 2; k++) {
      s = applyMove(s, half);
      seen.push(t.update(s, half).status);
    }
  }
  check('never reported as wrong', !seen.includes('off-track'), seen.join(','));
  check('alternates yellow then green',
    seen.every((st, i) => (i % 2 === 0 ? st === 'partial' : st === 'on-track' || st === 'complete')), seen.join(','));
  check('ends with the scramble complete', t.peek().status === 'complete');
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
