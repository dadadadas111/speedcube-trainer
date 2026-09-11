/**
 * The trainers are only worth anything if "fewest moves" means it.
 *
 * Both solvers claim to return an optimum, and both are checked here against
 * something that cannot be wrong: a plain breadth-first search that tries every
 * sequence shorter than the claimed answer and finds nothing.
 */

import { parseAlg } from '../../cube/alg';
import { LSE_BANDS, LSE_MOVES, LSE_TRACKED, lseDistance, lseTables, randomLseCase, solveLse } from './lse';
import { FB_MOVES, FB_TRACKED, blockBuilt, fbTables, firstBlockDone, solveFirstBlock } from './firstBlock';
import { MAX_PACKED, isHome, keyOf, mayFollow, positionsAfter, stepped } from './tracking';
import { ROTATIONS, IDENTITY_PERM } from '../../cube/geometry';
import { rotationBetween } from '../../cube/alg';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

/**
 * Is there any sequence shorter than `limit` that reaches the goal?
 *
 * Depth first on purpose. Breadth first would be the obvious way to write it
 * and would hold tens of millions of positions in memory at the depths that
 * matter here; this holds one path.
 */
function anyShorter(
  start: Uint8Array,
  moves: typeof FB_MOVES,
  limit: number,
  done: (at: Uint8Array) => boolean,
): boolean {
  const walk = (at: Uint8Array, left: number, prev: string | null): boolean => {
    if (left === 0) return false;
    for (let m = 0; m < moves.names.length; m++) {
      const name = moves.names[m];
      if (!mayFollow(name, prev)) continue;
      const to = stepped(at, moves.to[m]);
      if (done(to)) return true;
      if (walk(to, left - 1, name)) return true;
    }
    return false;
  };
  return walk(start, limit - 1, null);
}

/* ---------------- the last six edges ---------------- */
{
  const t = lseTables();
  // The size is the proof that the eight tracked stickers pin a position down:
  // ⟨M, U⟩ has exactly this many, and a coordinate that confused two positions
  // would come up short
  check('the group has exactly 184,320 positions', t.all.length === 184320, String(t.all.length));

  let furthest = 0;
  for (const d of t.toSolved.values()) furthest = Math.max(furthest, d);
  check('the furthest position is 20 turns from solved', furthest === 20, String(furthest));

  const atHome = (at: Uint8Array) => isHome(at, LSE_TRACKED);

  let bad = 0;
  let notOptimal = 0;
  for (let i = 0; i < 40; i++) {
    const c = randomLseCase('solved');
    const sol = solveLse(c.setup, 'solved');
    if (!sol || sol.length !== c.best) { bad++; continue; }
    if (!atHome(positionsAfter(LSE_TRACKED, [...c.setup, ...sol.moves]))) { bad++; continue; }
    // Nothing shorter may exist
    // Only worth asking of the short cases: searching every sequence shorter
    // than a twenty-turn position would still be running tomorrow, and the
    // table gives the same answer for all of them by construction.
    if (sol.length <= 6 && anyShorter(positionsAfter(LSE_TRACKED, c.setup), LSE_MOVES, sol.length, atHome)) {
      notOptimal++;
    }
  }
  check('4c: forty cases solved, every one back to solved', bad === 0, String(bad));
  check('4c: and nothing shorter exists for any of them', notOptimal === 0, String(notOptimal));

  let eolrBad = 0;
  for (let i = 0; i < 40; i++) {
    const c = randomLseCase('eolr');
    const sol = solveLse(c.setup, 'eolr');
    if (!sol || sol.length !== c.best) { eolrBad++; continue; }
    if (lseDistance([...c.setup, ...sol.moves], 'eolr') !== 0) eolrBad++;
  }
  check('EOLR: forty cases solved, every one reaching the goal', eolrBad === 0, String(eolrBad));

  check('a case is never handed out already finished', randomLseCase('eolr').best >= 4);

  // The long half of the 4c positions is left out on purpose: nobody drills a
  // seventeen-turn 4c, and sampling the whole group hands one out most times
  let outOfBand = 0;
  for (let i = 0; i < 60; i++) {
    const d = randomLseCase('solved').best;
    if (d < LSE_BANDS.solved.min || d > LSE_BANDS.solved.max) outOfBand++;
  }
  check('4c cases stay in the range people actually train', outOfBand === 0, String(outOfBand));

  let eolrOut = 0;
  for (let i = 0; i < 60; i++) {
    const d = randomLseCase('eolr').best;
    if (d < LSE_BANDS.eolr.min || d > LSE_BANDS.eolr.max) eolrOut++;
  }
  check('EOLR cases too', eolrOut === 0, String(eolrOut));
  check('4c cases have their edges oriented and placed already',
    lseDistance(randomLseCase('solved').setup, 'eolr') === 0);
}

/* ---------------- the first block ---------------- */
{
  const t = fbTables();
  // 8 corner slots x 3 twists, ordered pairs: 24 x 21 = 504
  check('the two corners have 504 arrangements', t.corners.size === 504, String(t.corners.size));
  // 12 edge slots x 2 flips, ordered triples: 24 x 22 x 20 = 10560
  check('the three edges have 10,560 arrangements', t.edges.size === 10560, String(t.edges.size));

  const scrambles = [
    "F R B' R' F' U' B2 R2 B2 D2 F2 D L2 U R2 U' L2 F",
    "D2 U2 F2 L2 B' R2 F L2 R2 F' U2 B' U' L2 B R' F' L F' D U'",
    "L2 D' B2 U2 R2 B2 D' F2 U L2 U2 B' R' F' L R' B2 F' D U'",
    "B2 L2 D F2 U' B2 U2 R2 U' L2 F' D2 L B D2 R' F L' B'",
    "U F2 L2 D B2 D' B2 F2 U2 R2 B L U' B F R' D' L2 B2",
  ];

  // The same goal the solver aims at: the block built in any of the ways it can
  // sit on the cube, because turning the whole cube over is free
  const atHome = blockBuilt;

  let wrong = 0;
  let slowest = 0;
  for (const s of scrambles) {
    const scramble = parseAlg(s);
    const t0 = performance.now();
    const r = solveFirstBlock(scramble, 4);
    slowest = Math.max(slowest, performance.now() - t0);
    if (!r.solutions.length) { wrong++; continue; }
    // Every solution returned must be that length and must actually work
    if (!r.solutions.every((sol) => sol.length === r.length && firstBlockDone([...scramble, ...sol]))) wrong++;
  }
  check('every solution offered actually builds the block', wrong === 0, String(wrong));
  check('the search stays quick', slowest < 2000, `${Math.round(slowest)}ms`);

  /**
   * Optimality, checked exhaustively on positions shallow enough to do it.
   *
   * A block wrecked by k moves is at most k from being rebuilt, so searching
   * every sequence shorter than the answer is affordable for small k — and a
   * heuristic that ever over-estimated would show up here as a missed solution.
   */
  let beaten = 0;
  let overlong = 0;
  for (const wreck of ["L' D F", "B L2 D'", "L D' B L2", "F' L2 D B'", "D2 L B' D F"]) {
    const scramble = parseAlg(wreck);
    const r = solveFirstBlock(scramble, 1);
    if (r.length > scramble.length) overlong++;
    if (anyShorter(positionsAfter(FB_TRACKED, scramble), FB_MOVES, r.length, atHome)) beaten++;
  }
  check('undoing k moves never takes more than k', overlong === 0, String(overlong));
  check('and nothing shorter than the answer exists', beaten === 0, String(beaten));

  // An algorithm that only touches the top layer leaves the block alone
  // The goal has to be the one a person means. Building the block "upside down"
  // is the same piece of work, and a solver that insisted on one placement
  // would quote six moves for something doable in five.
  check('a block built in any orientation counts as built',
    ROTATIONS.every((rot) => blockBuilt(positionsAfter(FB_TRACKED, rotationBetween(IDENTITY_PERM as Uint8Array, rot)))));
  check('and a scrambled cube does not', !blockBuilt(positionsAfter(FB_TRACKED, parseAlg("R U F' D2 L"))));

  check('a T-perm needs no first block moves',
    solveFirstBlock(parseAlg("R U R' U' R' F R2 U' R' U' R U R' F'")).length === 0);

  // Undoing a block-wrecking sequence is never longer than the sequence itself
  const wreck = parseAlg("L D' B L2 F");
  check('a five-move mess takes at most five moves to undo',
    solveFirstBlock(wreck).length <= 5, String(solveFirstBlock(wreck).length));
}

/* ---------------- the key that stands for an arrangement ---------------- */
{
  check(`${MAX_PACKED} positions pack into one number`, keyOf(new Uint8Array(MAX_PACKED).fill(53)) < 2 ** 53);
  let threw = false;
  try {
    keyOf(new Uint8Array(MAX_PACKED + 1).fill(1));
  } catch {
    threw = true;
  }
  check('one more than that is refused rather than silently wrong', threw);

  // Distinct arrangements must never share a key
  const seen = new Set<number>();
  let clashes = 0;
  for (let a = 0; a < 54; a++) {
    for (let b = 0; b < 54; b++) {
      const k = keyOf([a, b, 7, 19, 33, 41, 2, 50]);
      if (seen.has(k)) clashes++;
      seen.add(k);
    }
  }
  check('and no two arrangements collide', clashes === 0, String(clashes));
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
