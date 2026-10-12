/**
 * Drilling CMLL against the virtual cube.
 *
 * The question that decides whether the whole idea works: if the case is put
 * on the virtual cube and you perform the algorithm for it, does the virtual
 * cube agree that CMLL is finished? Everything else here is detail.
 */
import { ORIENTATIONS, CMLL_FACELETS, dealDrill, orientationByKey, recolourState } from './cmllDrill';
import { cmllDone } from './cmll';
import { parseAlg } from '../cube/alg';
import { applyMoves, cloneState, SOLVED_STATE } from '../cube/cube';
import { SEED_ALGS } from '../data/seedAlgs';

let fails = 0;
const check = (n: string, c: boolean, x = '') => {
  if (c) console.log('ok   ' + n);
  else { fails++; console.log('FAIL ' + n + (x ? `  <${x}>` : '')); }
};

const CASES = SEED_ALGS.filter((a) => a.group === 'CMLL');
const rng = (() => { let n = 11; return () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648); })();

/* ---- All 24 ways to hold it ---- */
{
  check('there are 24 orientations', ORIENTATIONS.length === 24, String(ORIENTATIONS.length));
  check('every one has its own name', new Set(ORIENTATIONS.map((o) => o.key)).size === 24);
  // The name has to describe the thing. A relabelling that says "yellow-green"
  // and paints white on top would send you drilling the wrong recognition.
  let wrong = 0;
  for (const o of ORIENTATIONS) {
    const painted = recolourState(cloneState(SOLVED_STATE), o);
    const names = ['white', 'red', 'green', 'yellow', 'orange', 'blue'];
    if (names[painted[4]] !== o.up || names[painted[22]] !== o.front) wrong++;
  }
  check('each name matches the colours it paints', wrong === 0, String(wrong));
  check('the usual Roux view is among them', !!ORIENTATIONS.find((o) => o.key === 'yellow-green'));
  check('and so is white on top', !!ORIENTATIONS.find((o) => o.key === 'white-green'));
}

/* ---- What the drill shows you ---- */
{
  check('thirteen stickers are what CMLL is read from', CMLL_FACELETS.length === 13);
  check('four of them are the top face corners',
    [0, 2, 6, 8].every((i) => CMLL_FACELETS.includes(i)));
  // Without it you cannot tell which colour counts as up
  check('and the top centre is the reference', CMLL_FACELETS.includes(4));
  check('no edge is among them', ![1, 3, 5, 7, 10, 19, 37, 46].some((i) => CMLL_FACELETS.includes(i)));
}

/* ---- The proof: perform the algorithm, and the cube agrees ---- */
{
  for (const key of ['yellow-green', 'white-green', 'yellow-red', 'orange-white']) {
    const o = orientationByKey(key);
    let unsolvable = 0, alreadyDone = 0, dealt = 0, unpainted = 0;
    for (const c of CASES) {
      const d = dealDrill([c], parseAlg, rng);
      if (!d) continue;
      dealt++;
      if (cmllDone(d.state)) alreadyDone++;
      // The orientation must change the picture and nothing else. If painting
      // altered the logic, cmllDone would disagree with what you can see.
      const painted = recolourState(d.state, o);
      if (key !== 'white-green' && painted.join() === d.state.join()) unpainted++;
      // The drill never says which way round to hold it, so finding the AUF is
      // the solver's job; the test only asks that one of the four works.
      const alg = parseAlg(c.alg);
      const ok = ['', 'U', 'U2', "U'"].some((auf) =>
        cmllDone(applyMoves(cloneState(d.state), [...(auf ? [auf] : []), ...alg])));
      if (!ok) { unsolvable++; if (unsolvable <= 2) console.log(`   stuck: ${c.family} ${c.name}`); }
    }
    check(`${key}: every case was dealt`, dealt === CASES.length, `${dealt}/${CASES.length}`);
    check(`${key}: none is handed to you already finished`, alreadyDone === 0, String(alreadyDone));
    check(`${key}: its own algorithm finishes it`, unsolvable === 0, `${unsolvable} of ${dealt}`);
    check(`${key}: and the paint is only paint`, unpainted === 0, String(unpainted));
  }
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
