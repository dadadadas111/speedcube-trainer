/**
 * How hard the app is allowed to ask whether the solve is over.
 *
 * Six tries across four seconds was too timid: a solve could finish with the
 * last turns still stuck in the library's buffer, the clock would run on, and
 * the only way out was throwing the solve away as a DNF. The number that gets
 * recorded when it does stop comes from the last turn the cube reported, not
 * from when the stopping happened — which is why offering to stop is worth
 * doing, and why it is not a DNF. That part is checked in a browser, since it
 * lives in the timer page and the bluetooth library will not load here.
 */

import { CommandBudget } from './dispatch';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

/* ---- Asking the cube persistently, without flooding it ---- */
{
  // Six tries over four seconds was not enough: a solve could finish and the
  // clock run on with DNF the only way out
  const budget = new CommandBudget(700, 24);
  budget.refill(0);
  let asks = 0;
  for (let t = 0; t <= 20_000; t += 50) if (budget.take(t)) asks++;
  check('it keeps asking two dozen times', asks === 24, String(asks));

  const fresh = new CommandBudget(700, 24);
  fresh.refill(0);
  let last = -1;
  let closest = Infinity;
  for (let t = 0; t <= 20_000; t += 10) {
    if (!fresh.take(t)) continue;
    if (last >= 0) closest = Math.min(closest, t - last);
    last = t;
  }
  check('never faster than 700ms apart', closest >= 700, String(closest));
  check('so under two writes a second', 1000 / closest < 2, String((1000 / closest).toFixed(2)));

  // And turning the cube always wins over asking it questions
  const busy = new CommandBudget(700, 24);
  busy.refill(0);
  for (let t = 700; t <= 700 * 24; t += 700) busy.take(t);
  check('spent after two dozen', !busy.take(700 * 25));
  busy.refill(700 * 25);
  check('a move gives it all back', busy.take(700 * 26));
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
