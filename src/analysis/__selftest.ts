import { SOLVED_STATE, applyMoves, applyPerm, stateSequence, isSolved, PIECES, groupSolved, canonicalKey, COLOR_FRAMES, recolor } from '../cube/cube';
import { ROTATIONS } from '../cube/geometry';
import { invertAlg } from '../cube/alg';
import { simulateSensorStream } from '../cube/sensorSim';
import { detectStages, scanStages, ROUX_STAGES, rouxEdgesOriented } from './method';

let fails = 0;
const check = (name: string, cond: boolean, extra = '') => {
  if (!cond) { fails++; console.log('FAIL ' + name + (extra ? '  <' + extra + '>' : '')); }
  else console.log('ok   ' + name);
};
const anyRot = (s: Uint8Array, f: (s: Uint8Array, r: Uint8Array) => boolean) => ROTATIONS.some(r => f(s, r));

/* ---- Build a valid Roux solve backwards, each step using only moves that preserve the previous one ---- */
const FB   = ['D', 'L', "F'", 'B2', "D'"];
const SB   = ['R', 'U', "R'", 'M', 'U', "M'", 'r', 'U', "r'"];
const CMLL = ['R', 'U', "R'", 'U', 'R', 'U2', "R'"];   // Sune: touches only U corners and U edges
const EO   = ['U', 'M', "U'", "M'"];
const LR   = ['U', 'M2', "U'"];
const L4C  = ['M2'];
const SOLUTION = [...FB, ...SB, ...CMLL, ...EO, ...LR, ...L4C];
const start = applyMoves(SOLVED_STATE, invertAlg(SOLUTION));
const states = stateSequence(start, SOLUTION);

const B = { FB: FB.length, SB: 0, CMLL: 0, EO: 0, LR: 0, L4C: 0 };
B.SB = B.FB + SB.length; B.CMLL = B.SB + CMLL.length; B.EO = B.CMLL + EO.length;
B.LR = B.EO + LR.length; B.L4C = B.LR + L4C.length;

check('the solve ends solved', isSolved(states[states.length - 1]));
check('CMLL (Sune) does not break the blocks',
  anyRot(states[B.CMLL], (s, r) => groupSolved(s, r, PIECES.FB) && groupSolved(s, r, PIECES.SB)));

const det = detectStages(states, ROUX_STAGES);
const got = Object.fromEntries(det.map(d => [d.key, d.endIndex])) as Record<string, number>;
console.log('  expected :', B);
console.log('  detected :', got);
for (const k of Object.keys(B) as (keyof typeof B)[]) {
  // EO can finish before the last move of 4a: with only the M slice off by 90
  // degrees the edges are already oriented, and the rest belongs to 4c.
  // 4b can finish before its last move too: that final U is just an AUF, with
  // UL/UR already in place before it.
  if (k === 'LR') check('4b detected no later than constructed', got[k] <= B[k] && got[k] > B.EO, `${got[k]} vs ${B[k]}`);
  else check(`${k} detected`, got[k] === B[k], `${got[k]}`);
}

// The EO criterion must be invariant under 4b's own move group, ⟨M2, U⟩
{
  const oriented = rouxEdgesOriented;
  const ID = ROTATIONS.find((r) => r.every((v, i) => v === i))!;
  check('EO: solved counts as oriented', oriented(SOLVED_STATE, ID));
  // The orientation condition must hold across 4b's group, or doing 4b would
  // break EO — which contradicts the order of Roux's steps.
  const g4b = ['U', "U'", 'U2', 'M2', 'U M2', "M2 U' M2", "M2 U2 M2 U'", 'U M2 U2 M2 U'];
  const broken = g4b.filter((r) => !anyRot(applyMoves(SOLVED_STATE, r.split(' ')), oriented));
  check('EO: invariant under the whole ⟨M2, U⟩ group of 4b', broken.length === 0, broken.join(' | '));
  check('EO: a single M breaks it (M slice off by 90 degrees)', !anyRot(applyMoves(SOLVED_STATE, ['M']), oriented));
  check('EO: a half-right state is rejected', !anyRot(applyMoves(SOLVED_STATE, ['M', 'U', "M'", "U'"]), oriented));
  // And it must NOT be invariant under a lone M — that is why 4a exists at all
  check('EO: can be broken by some M/U sequence',
    ["M U M' U'", "M' U2 M U", 'M U2 M'].some((r) => !anyRot(applyMoves(SOLVED_STATE, r.split(' ')), oriented)));
}

check('monotonic', det.every((d, i) => i === 0 || d.endIndex >= det[i - 1].endIndex));

/* ---- Invariance under the solver's CHOICE OF COLOURS ----
   A rotation moves the positions but leaves the colours pinned where they are,
   so on its own it only ever recognises the one block whose colours match what
   the app calls bottom-left. A solver picks their own block and holds the cube
   however they like, so the scan has to relabel the colours too. */
{
  const want = det.map((d) => d.endIndex).join(',');
  const bad: string[] = [];
  COLOR_FRAMES.forEach((colors, i) => {
    const seen = states.map((s) => recolor(s, colors));
    const got = scanStages(seen, ROUX_STAGES).detections.map((d) => d.endIndex).join(',');
    if (got !== want) bad.push(`${i}:${got}`);
  });
  check('same boundaries under all 24 colour schemes', bad.length === 0, bad.join(' | '));
  check('the plain scan is what the auto scan picks for a canonical solve',
    scanStages(states, ROUX_STAGES).detections.map((d) => d.endIndex).join(',') === want);
}
check('EO not done right after CMLL', !anyRot(states[B.CMLL], ROUX_STAGES[3].test));
check('4b not done right after EO', !anyRot(states[B.EO], ROUX_STAGES[4].test));

/* ---- Invariance under an orientation that CHANGES OVER TIME ----
   This is the property the whole design rests on: every state is tested against
   all 24 orientations independently, so a drifting frame changes nothing. */
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const wobbled = states.map((s) => applyPerm(s, ROTATIONS[Math.floor(rnd() * 24)]));
const detW = detectStages(wobbled, ROUX_STAGES);
check('invariant when each state is rotated differently',
  detW.every((d, i) => d.endIndex === det[i].endIndex), JSON.stringify(detW.map(d => d.endIndex)));

/* ---- Simulating exactly what the GAN sensors report ----
   The sensors only see the six faces turning relative to the CORE. A slice or
   wide move turns the core, so every move after it lands in a rotated frame. */
const reported = simulateSensorStream(SOLUTION);
check('the sample solve contains an r and an M', SOLUTION.some(m => m[0] === 'r') && SOLUTION.some(m => m[0] === 'M'));
check('the sensor stream is face moves only', reported.every(m => 'URFDLB'.includes(m[0])));

const statesR = stateSequence(start, reported);
check('the sensor stream still ends solved', isSolved(statesR[statesR.length - 1]));
check('the final state differs from the real one by exactly a rotation',
  canonicalKey(statesR[statesR.length - 1]) === canonicalKey(states[states.length - 1]));

const detR = detectStages(statesR, ROUX_STAGES);
// M splits into 2 events so indices shift; compare against the count of preceding M moves
const mBefore = (idx: number) => SOLUTION.slice(0, idx).filter(m => 'MES'.includes(m[0])).length;
console.log('  sensor   :', detR.map(d => d.endIndex).join(','));
check('step boundaries match once event counts are converted',
  det.every((d, i) => detR[i].endIndex === d.endIndex + mBefore(d.endIndex)),
  JSON.stringify(det.map(d => d.endIndex + mBefore(d.endIndex))));

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);

/* ---- The AUF frame set: for LSE steps, where the U layer spins constantly ---- */
{
  const { ROTATIONS_WITH_AUF } = await import('./method');
  const cmll = ROUX_STAGES[2].test;
  const anyStrict = (s: Uint8Array) => ROTATIONS.some((r) => cmll(s, r));
  const anyAuf = (s: Uint8Array) => ROTATIONS_WITH_AUF.some((r) => cmll(s, r));

  check('the AUF frame set has 96 permutations', ROTATIONS_WITH_AUF.length === 96, String(ROTATIONS_WITH_AUF.length));
  check('solved: both sets see the corners done', anyStrict(SOLVED_STATE) && anyAuf(SOLVED_STATE));

  // Turning U on a solved cube: the corners are still "CMLL-done", just un-AUFed
  for (const u of ['U', "U'", 'U2']) {
    const s = applyMoves(SOLVED_STATE, [u]);
    check(`after ${u}: the strict set says corners NOT done`, !anyStrict(s));
    check(`after ${u}: the AUF set says corners done`, anyAuf(s));
  }
  // But turning another face genuinely breaks the corners, and both must see it
  check('after R: both sets say corners not done', !anyStrict(applyMoves(SOLVED_STATE, ['R'])) && !anyAuf(applyMoves(SOLVED_STATE, ['R'])));
  // The AUF set must not loosen the block requirement
  check('the AUF set still requires the blocks', !anyAuf(applyMoves(SOLVED_STATE, ['D'])));
}
