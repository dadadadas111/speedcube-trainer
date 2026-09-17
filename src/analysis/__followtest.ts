/**
 * Following a written solve on a cube that cannot see rotations — and cannot
 * see slices either, which is the part that was wrong for a long time.
 *
 * The check that matters is the last one, and it has to replay the solve the
 * way six face sensors actually report it. Replaying the app's OWN move names
 * proves nothing: it agrees with itself by construction, which is exactly why
 * an earlier version of this file passed 39 out of 39 while every one of those
 * solves went off track on a real cube at the first M.
 */

import { followSteps, followMoves, hiddenTurn, progressInWritten, sensedMoves, writtenIndex } from './followSolve';
import { canonicalKey } from '../cube/cube';
import { cmllDone, cmllScrambleFor } from './cmll';
import { SEED_ALGS } from '../data/seedAlgs';
import { ScrambleTracker } from './scrambleGuide';
import { PRO_SOLVES } from '../data/proSolves';
import { parseAlg } from '../cube/alg';
import { applyMoves, applyMove, SOLVED_STATE, cloneState, isSolved } from '../cube/cube';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

const SLICES_AND_WIDES = ['M', 'E', 'S', 'r', 'l', 'u', 'd', 'f', 'b'].flatMap((f) => [f, f + "'", f + '2']);
const isFaceTurn = (m: string) => /^[URFDLB]['2]?$/.test(m);

/* ---- What a cube can actually report ---- */
{
  // Six sensors, one per face, and no seventh for the middle. Every slice and
  // every wide move is therefore a pair of face turns plus a rotation of the
  // core that nothing can see. These rows are the whole basis of the rewriting
  // below, so they are rebuilt from the permutations rather than trusted.
  let wrong = 0;
  for (const m of SLICES_AND_WIDES) {
    const seen = hiddenTurn(m);
    if (!seen) { wrong++; console.log(`   no row for ${m}`); continue; }
    const direct = applyMoves(cloneState(SOLVED_STATE), [m]);
    const viaSensors = applyMoves(cloneState(SOLVED_STATE), [...seen.turns, seen.rot]);
    if (direct.join(',') !== viaSensors.join(',')) {
      wrong++;
      console.log(`   ${m} != ${seen.turns.join(' ')} + ${seen.rot}`);
    }
    if (!seen.turns.every(isFaceTurn)) { wrong++; console.log(`   ${m} decomposes to a non-face turn`); }
  }
  check('every slice and wide is face turns plus a hidden rotation', wrong === 0, String(wrong));
  check('a plain face turn hides nothing', !hiddenTurn('R') && !hiddenTurn("U2"));
}

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
  check('the count is unchanged when no slice is involved', t[0].moves.length === 3);
  check('what they wrote is kept for reading', t[0].written.join(' ') === "U R' U'", t[0].written.join(' '));
}

/* ---- A slice is one thing to read and two things to watch for ---- */
{
  const s = followSteps([{ label: 'sb', moves: parseAlg("R U M' R'") }]);
  check('nothing the cube cannot sense is asked for', s[0].moves.every(isFaceTurn), s[0].moves.join(' '));
  check("M' becomes two turns", s[0].moves.length === 5, `${s[0].moves.length}`);
  check('but stays one thing to read', s[0].written.join(' ') === "R U M' R'");
  check('and both halves point back at it', s[0].belongsTo.join(',') === '0,1,2,2,3', s[0].belongsTo.join(','));

  // The hidden rotation has to reach the moves AFTER it, or the guide asks for
  // the wrong face for the rest of the solve — which is the bug this is here
  // to stop coming back
  // U, not R: M' hides an x, and x turns about the R-L axis, so R is one of
  // the two faces it leaves alone. Picking R here proves nothing.
  const plain = followSteps([{ label: 'a', moves: parseAlg("U'") }]);
  const after = followSteps([{ label: 'a', moves: parseAlg("M' U'") }]);
  check("U' after an M' is a different face to the cube",
    after[0].moves[after[0].moves.length - 1] !== plain[0].moves[0],
    `${after[0].moves.join(' ')} vs ${plain[0].moves.join(' ')}`);
  check('and R is rightly left alone, being on the axis',
    followSteps([{ label: 'a', moves: parseAlg("M' R'") }])[0].moves.join(' ') === "L R' R'");
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

/* ---- The guide points at the move you are reading ---- */
{
  const s = followSteps([{ label: 'sb', moves: parseAlg("R U M' R'") }])[0];
  check('nothing done yet points at the first written move', writtenIndex(s, 0) === 0);
  check('halfway through the slice still points at the slice', writtenIndex(s, 2) === 2 && writtenIndex(s, 3) === 2);
  check('past it, at the move after', writtenIndex(s, 4) === 3);
  check('all done points past the end', writtenIndex(s, 5) === 4);

  const t = new ScrambleTracker(s.moves);
  let p = t.update(cloneState(SOLVED_STATE));
  let state = cloneState(SOLVED_STATE);
  for (const m of s.moves.slice(0, 3)) { state = applyMove(state, m); p = t.update(state, m); }
  const w = progressInWritten(s, p);
  check('the guide counts in written moves', w.total === 4, String(w.total));
  check('and stays on the slice while its second half is pending', w.done === 2, String(w.done));
}

/* ---- The proof: every bundled solve, replayed as a cube reports it ---- */
{
  let broken = 0, offTrack = 0, withRotations = 0, withSlices = 0;
  for (const solve of PRO_SOLVES) {
    const steps = followSteps(solve.steps.map((s) => ({ label: s.label, moves: parseAlg(s.moves) })));
    if (steps.some((s) => s.hold.length)) withRotations++;
    if (solve.steps.some((s) => /(^|\s)[MESrludfb]/.test(s.moves))) withSlices++;

    let state = applyMoves(SOLVED_STATE, parseAlg(solve.scramble));
    let lost = false;
    for (const st of steps) {
      // Exactly what ProSolve does: a tracker per step, fed the cube's turns
      const t = new ScrambleTracker(st.moves, cloneState(state));
      let p = t.update(state);
      for (const m of st.moves) {
        state = applyMove(state, m);
        p = t.update(state, m);
      }
      if (p.status !== 'complete') lost = true;
    }
    if (lost) offTrack++;
    if (!isSolved(state)) {
      broken++;
      console.log(`   không giải được: ${solve.solver} #${solve.id}`);
    }
  }
  check('most solves do contain rotations', withRotations > PRO_SOLVES.length / 2, String(withRotations));
  check('and most contain a slice or a wide', withSlices > PRO_SOLVES.length / 2, String(withSlices));
  check('no step asks for anything but a face turn',
    PRO_SOLVES.every((s) =>
      followMoves(followSteps(s.steps.map((x) => ({ label: x.label, moves: parseAlg(x.moves) })))).every(isFaceTurn)));
  check('the guide stays on track through every step', offTrack === 0, String(offTrack));
  check('and every one still SOLVES its scramble', broken === 0, String(broken));
}

/* ---- Nothing is lost ---- */
{
  let bad = 0;
  for (const solve of PRO_SOLVES) {
    const original = parseAlg(solve.steps.map((s) => s.moves).join(' ')).filter((m) => !/^[xyz]/.test(m));
    // A slice counts twice, because the cube sees two turns
    const expected = original.reduce((n, m) => n + (hiddenTurn(m)?.turns.length ?? 1), 0);
    const after = followMoves(followSteps(solve.steps.map((s) => ({ label: s.label, moves: parseAlg(s.moves) }))));
    if (after.length !== expected) { bad++; console.log(`   ${solve.solver}: ${expected} -> ${after.length}`); }
    const written = followSteps(solve.steps.map((s) => ({ label: s.label, moves: parseAlg(s.moves) })))
      .reduce((n, s) => n + s.written.length, 0);
    if (written !== original.length) { bad++; console.log(`   ${solve.solver}: reads ${original.length} -> ${written}`); }
  }
  check('every turn survives the rewriting, and reads as one move', bad === 0, String(bad));
}

/* ---- The same rewriting, for anything else the app asks you to turn ---- */
{
  // A CMLL scramble is built from U and M, and an LSE case is mostly M. Both
  // went through a tracker that was watching for a layer the cube has no
  // sensor for: red at the first half of every slice, an instruction to undo a
  // turn the app had just asked for, and the app's idea of the centres left a
  // quarter turn from the cube's once the drill ended.
  const rng = (() => { let n = 7; return () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648); })();
  let off = 0, notCase = 0, slicesLeft = 0, dealt = 0;
  for (const c of SEED_ALGS.filter((a) => a.group === 'CMLL').slice(0, 30)) {
    const written = cmllScrambleFor(parseAlg(c.alg), rng);
    if (!written) continue;
    dealt++;
    const seen = sensedMoves(written);
    if (!seen.moves.every(isFaceTurn)) slicesLeft++;

    // Applying what the cube sees must reach the same case as what you read
    const direct = applyMoves(cloneState(SOLVED_STATE), written);
    const viaSensors = applyMoves(cloneState(SOLVED_STATE), seen.moves);
    if (canonicalKey(direct) !== canonicalKey(viaSensors)) notCase++;
    if (cmllDone(viaSensors)) notCase++;

    // And the guide must follow it start to finish without ever crying wrong
    let state = cloneState(SOLVED_STATE);
    const t = new ScrambleTracker(seen.moves, cloneState(state));
    let p = t.update(state);
    for (const m of seen.moves) {
      state = applyMove(state, m);
      p = t.update(state, m);
      if (p.status === 'off-track') off++;
    }
    if (p.status !== 'complete') off++;
  }
  check('CMLL scrambles were dealt to test with', dealt > 20, String(dealt));
  check('a dealt scramble asks for nothing the cube cannot sense', slicesLeft === 0, String(slicesLeft));
  check('and still sets up the same case', notCase === 0, String(notCase));
  check('and never once says you turned the wrong thing', off === 0, String(off));

  // The invariant the whole thing rests on, stated plainly
  const seq = parseAlg("M' U r U' M2 u S' d2 E");
  const seen = sensedMoves(seq);
  check('any sequence at all reaches the same place, held differently',
    canonicalKey(applyMoves(cloneState(SOLVED_STATE), seq)) ===
      canonicalKey(applyMoves(cloneState(SOLVED_STATE), seen.moves)));
  check('and reads back exactly as it was written', seen.written.join(' ') === seq.join(' '));
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
