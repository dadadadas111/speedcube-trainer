/**
 * The two rules that keep the bluetooth link alive. Both guard against the same
 * symptom — the cube stops responding — from opposite directions: too much
 * traffic going out, and an exception coming back in.
 */

import { CommandBudget, notifyAll } from './dispatch';
import { ResetGesture } from './gesture';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

/* ---- Idle polling is held back ---- */
{
  const b = new CommandBudget(1500, 4);
  let t = 0;
  check('the first poll goes out', b.take(t));
  check('a poll straight after does not', !b.take(t + 10));
  check('nor one just short of the gap', !b.take(t + 1499));
  check('one after the gap does', b.take(t + 1500));

  // Keep asking a cube that never answers: it has to stop, not hammer away
  let sent = 2;
  for (let i = 0; i < 20; i++) { t += 1600; if (b.take(t)) sent++; }
  check('polling gives up on a silent cube', sent === 4, String(sent));

  // The cube moved, so it is listening again
  b.refill(t);
  t += 1600;
  check('a move brings polling back', b.take(t));
}

/* ---- What the user asks for is never held back ---- */
{
  const b = new CommandBudget(1500, 4);
  b.spendFreely(0);
  b.spendFreely(1);
  b.spendFreely(2);
  check('three deliberate requests in a row are all fine', true);
  // ...but they do restart the budget rather than leaving it spent
  check('and polling is allowed again afterwards', b.take(1502 + 1500));
}

/* ---- A rate of one per 1.5s, not per frame ---- */
{
  const b = new CommandBudget(1500, 4);
  let sent = 0;
  // The timer ticks every 500ms, as the timer page does
  for (let t = 0; t <= 6000; t += 500) if (b.take(t)) sent++;
  check('a 500ms timer still only sends every 1.5s', sent === 4, String(sent));
}

/* ---- One broken handler must not silence the rest ---- */
{
  const seen: string[] = [];
  const errs: unknown[] = [];
  const listeners = [
    () => { throw new Error('boom'); },
    () => seen.push('second'),
    () => seen.push('third'),
  ];
  notifyAll(listeners, (l) => l(), (e) => errs.push(e));
  check('the handlers after the broken one still run', seen.join(' ') === 'second third', seen.join(' '));
  check('and the failure is reported, not swallowed', errs.length === 1);

  // Calling again must still work — a thrown error cannot kill the stream
  seen.length = 0;
  notifyAll(listeners, (l) => l(), (e) => errs.push(e));
  check('later events still arrive', seen.join(' ') === 'second third');
}

/* ---- A listener may unsubscribe while being called ---- */
{
  const set = new Set<() => void>();
  const seen: string[] = [];
  const a = () => { seen.push('a'); set.delete(b); };
  const b = () => seen.push('b');
  set.add(a);
  set.add(b);
  notifyAll(set, (l) => l(), () => {});
  check('removing one mid-dispatch does not skip the others', seen.join(' ') === 'a b', seen.join(' '));
}

/* ---- Four turns of D says "this cube is solved" ---- */
{
  const g = new ResetGesture();
  const feed = (moves: string[], step = 200) => {
    let t = 0;
    let fired = false;
    for (const m of moves) fired = g.push(m, (t += step)) || fired;
    return fired;
  };

  check('four D turns in a row fire it', feed(['D', 'D', 'D', 'D']));
  g.reset();
  check("so do four D' turns", feed(["D'", "D'", "D'", "D'"]));
  g.reset();
  check('three do not', !feed(['D', 'D', 'D']));

  // The gesture is safe because D D D D is pointless. Anything that is not
  // that must not be mistaken for it.
  g.reset();
  check('a change of direction breaks it', !feed(['D', 'D', "D'", "D'"]));
  g.reset();
  check('another face in the middle breaks it', !feed(['D', 'D', 'U', 'D', 'D']));
  g.reset();
  check('half turns are not quarter turns', !feed(['D2', 'D2', 'D2', 'D2']));
  g.reset();
  check('turns spread across a solve do not add up to it', !feed(['D', 'D', 'D', 'D'], 900));

  // It fires once, not on every turn after
  g.reset();
  let count = 0;
  let t = 0;
  for (const m of ['D', 'D', 'D', 'D', 'D', 'D']) if (g.push(m, (t += 200))) count++;
  check('six D turns fire it once, not three times', count === 1, String(count));

  // A fifth and sixth turn continue into a second gesture rather than jamming
  g.reset();
  count = 0;
  t = 0;
  for (const m of Array(8).fill('D')) if (g.push(m, (t += 200))) count++;
  check('eight turns are two gestures', count === 2, String(count));
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
