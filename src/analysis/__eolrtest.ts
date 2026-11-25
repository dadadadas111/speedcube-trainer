/**
 * EOLR on the virtual cube.
 *
 * The question that decides the drill: when the solver's own answer has been
 * performed, does the cube agree the step is finished? And the one that
 * decides whether it is worth doing: is a dealt case ever handed over already
 * done?
 */
import { LSE_EDGE_FACELETS, dealEolr, eolrDone } from './eolrDrill';
import { randomLseCase, solveLse } from './solver/lse';
import { applyMoves, cloneState, SOLVED_STATE } from '../cube/cube';
import { faceletsOfCubie } from '../cube/geometry';

let fails = 0;
const check = (n: string, c: boolean, x = '') => {
  if (c) console.log('ok   ' + n);
  else { fails++; console.log('FAIL ' + n + (x ? `  <${x}>` : '')); }
};

/* ---- The goal, agreed between the solver and the test ---- */
{
  check('a solved cube is finished', eolrDone(cloneState(SOLVED_STATE)));

  let unfinished = 0;
  for (let i = 0; i < 80; i++) {
    const c = randomLseCase('eolr');
    const sol = solveLse(c.setup, 'eolr');
    if (!sol) { unfinished++; continue; }
    const end = applyMoves(applyMoves(cloneState(SOLVED_STATE), c.setup), sol.moves);
    if (!eolrDone(end)) unfinished++;
  }
  check('the solver’s own answer always finishes it', unfinished === 0, `${unfinished} of 80`);
}

/* ---- What gets dealt is worth practising ---- */
{
  let already = 0, missing = 0, noBest = 0;
  for (let i = 0; i < 40; i++) {
    const d = dealEolr();
    if (!d) { missing++; continue; }
    if (eolrDone(d.state)) already++;
    if (!(d.best > 0)) noBest++;
  }
  check('a case is always dealt', missing === 0, String(missing));
  check('and never one that is already finished', already === 0, String(already));
  check('each comes with the fewest turns it can be done in', noBest === 0, String(noBest));
}

/* ---- The diagram shows the six edges and the two centres ---- */
{
  const want = ([
    [0, 1, 1], [0, 1, -1], [-1, 1, 0], [1, 1, 0], [0, -1, 1], [0, -1, -1],
  ] as [number, number, number][]).flatMap((v) => faceletsOfCubie(v as never));
  check('every sticker of all six edges is shown',
    want.every((i) => LSE_EDGE_FACELETS.includes(i)), String(want.filter((i) => !LSE_EDGE_FACELETS.includes(i))));
  // With the slice moving, the centres are what orientation is judged against
  check('and the two centres they are read against', [4, 31].every((i) => LSE_EDGE_FACELETS.includes(i)));
  check('no corner sticker sneaks in',
    ![0, 2, 6, 8, 9, 11, 18, 20].some((i) => LSE_EDGE_FACELETS.includes(i)));
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
