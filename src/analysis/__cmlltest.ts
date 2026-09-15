/**
 * Dealing CMLL: a scramble that keeps both blocks, and knowing when the corners
 * are done while the edges are still anywhere at all.
 */

import { cmllDone, cmllScrambleFor, dealCmll, freeTurns } from './cmll';
import { SEED_ALGS } from '../data/seedAlgs';
import { parseAlg, invertAlg } from '../cube/alg';
import { applyMoves, SOLVED_STATE, groupSolved, PIECES, type CubeState } from '../cube/cube';
import { ROTATIONS } from '../cube/geometry';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

const CMLL = SEED_ALGS.filter((a) => a.group === 'CMLL');
const from = (moves: string[]) => applyMoves(SOLVED_STATE, moves);
const blocksIntact = (s: CubeState) =>
  ROTATIONS.some((r) => groupSolved(s, r, PIECES.FB) && groupSolved(s, r, PIECES.SB));

/* ---- Knowing when to stop ---- */
{
  check('a solved cube is CMLL done', cmllDone(SOLVED_STATE));
  // The corners stay solved through the last six edges, turned by every AUF
  for (const auf of ['U', 'U2', "U'"]) {
    check(`still done after ${auf}`, cmllDone(from([auf])));
  }
  // M and U are the whole of LSE: none of it can undo CMLL
  check('still done after M and U turns', cmllDone(from(['M', 'U', "M'", 'U2', 'M2', "U'"])));
  check('and after a great many of them', cmllDone(from(freeTurns(40, mulberry(7)))));
  // But a turn that moves a corner is not
  check('a Sune away is not done', !cmllDone(from(parseAlg("R U R' U R U2 R'"))));
  check('a scrambled cube is not done', !cmllDone(from(parseAlg("R U R' F' R U R' U' R' F R2 U' R'"))));
}

/* ---- Every seeded case can be dealt, and dealing it is honest ---- */
{
  let bad = 0, alreadyDone = 0, broken = 0, unsolvable = 0;
  const rng = mulberry(42);
  for (const a of CMLL) {
    const moves = parseAlg(a.alg);
    for (let n = 0; n < 12; n++) {
      const scramble = cmllScrambleFor(moves, rng);
      if (!scramble) { bad++; continue; }
      const state = from(scramble);
      if (!blocksIntact(state)) { broken++; console.log('   block vỡ:', a.family, a.name); }
      if (cmllDone(state)) alreadyDone++;
      // The algorithm still finishes it, after an AUF. The turns tacked on the
      // end rotate the top layer, so the case arrives at a different angle —
      // which is the point, and is what you do before every CMLL anyway.
      const solvedByAuf = ['', 'U', 'U2', "U'"].some((auf) =>
        cmllDone(applyMoves(state, auf ? [auf, ...moves] : moves)),
      );
      if (!solvedByAuf) { unsolvable++; console.log('   alg không giải được:', a.family, a.name, scramble.join(' ')); }
    }
  }
  check('every case deals a scramble', bad === 0, String(bad));
  check('every scramble leaves both blocks standing', broken === 0, String(broken));
  check('no scramble is already finished', alreadyDone === 0, String(alreadyDone));
  check('the case\'s own algorithm, after an AUF, always finishes it', unsolvable === 0, String(unsolvable));
}

/* ---- The scramble does not simply read as the algorithm backwards ---- */
{
  const rng = mulberry(1);
  let giveaways = 0;
  for (const a of CMLL) {
    const moves = parseAlg(a.alg);
    const plain = invertAlg(moves).join(' ');
    for (let n = 0; n < 8; n++) {
      const s = cmllScrambleFor(moves, rng);
      if (s && s.join(' ') === plain) giveaways++;
    }
  }
  check('no scramble is the bare inverse of its algorithm', giveaways === 0, String(giveaways));
}

/* ---- Dealing from a pool ---- */
{
  const rng = mulberry(9);
  const seen = new Set<string>();
  for (let i = 0; i < 400; i++) {
    const d = dealCmll(CMLL, parseAlg, rng);
    if (!d) { check('the pool always deals', false); break; }
    seen.add(d.entry.family + ' ' + d.entry.name);
  }
  check('400 deals reach every one of the 42 cases', seen.size === 42, String(seen.size));

  const one = CMLL.filter((a) => a.family === 'Sune');
  const only = new Set<string>();
  for (let i = 0; i < 60; i++) only.add(dealCmll(one, parseAlg, rng)!.entry.family);
  check('a narrowed pool stays narrow', only.size === 1 && only.has('Sune'), [...only].join(','));

  check('an empty pool deals nothing', dealCmll([], parseAlg, rng) === null);
}

/* ---- Turns used around the algorithm cannot touch either block ---- */
{
  const rng = mulberry(3);
  for (let i = 0; i < 50; i++) {
    const t = freeTurns(10, rng);
    if (!blocksIntact(from(t))) { check('free turns keep the blocks', false, t.join(' ')); break; }
  }
  check('free turns keep the blocks', true);
  const faces = new Set(freeTurns(200, rng).map((m) => m[0]));
  check('free turns are only U and M', [...faces].every((f) => f === 'U' || f === 'M'), [...faces].join(''));
}

/** A seeded generator, so a failure can be run again. */
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
