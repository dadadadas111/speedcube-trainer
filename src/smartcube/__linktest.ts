/**
 * The two rules that keep the bluetooth link alive. Both guard against the same
 * symptom — the cube stops responding — from opposite directions: too much
 * traffic going out, and an exception coming back in.
 */

import { CommandBudget, notifyAll } from './dispatch';
import { ResetGesture } from './gesture';
import { macKeysFor } from './mac';
import { readConnectFailure } from './failure';

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

/* ---- The gesture must be holdable, because a solve has to hold it ---- */
{
  // The hold lives on the link rather than in the detector, so this checks the
  // shape of it: a counter that several callers can hold at once, and a release
  // that only counts once however many times it is called.
  let holds = 0;
  const hold = () => {
    holds++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      holds = Math.max(0, holds - 1);
    };
  };

  const a = hold();
  const b = hold();
  check('two holders stack', holds === 2, String(holds));
  a();
  check('releasing one leaves the other holding', holds === 1, String(holds));
  a();
  a();
  check('releasing the same one again changes nothing', holds === 1, String(holds));
  b();
  check('the last release lets go', holds === 0, String(holds));
  b();
  check('and it cannot go negative', holds === 0, String(holds));
}


/* ---- A saved MAC is found however Chrome describes the cube ---- */
{
  // The cube was filed under its name; this time the chooser reports no name
  const named = macKeysFor('GANicR_1234', 'abc123');
  const nameless = macKeysFor(undefined, 'abc123');
  check('a named cube is filed under both name and id', named.length === 2);
  check(
    'a nameless cube still shares a key with the named one',
    nameless.some((k) => named.includes(k)),
    JSON.stringify({ named, nameless }),
  );
  check('a cube with nothing to go on still gets a key', macKeysFor(null, null).length === 1);
  check('the same cube twice yields no duplicate keys', macKeysFor('x', 'x').length === 1);
}

/* ---- Failures are named, not quoted back ---- */
{
  const cases: [string, string, string][] = [
    ['NotFoundError', 'User cancelled the requestDevice() chooser.', 'cancelled'],
    ['NetworkError', 'Connection Error: Connection attempt failed.', 'asleep'],
    ['NetworkError', 'GATT Server is disconnected. Cannot perform GATT operations.', 'dropped'],
    ['Error', 'Unable to determine cube MAC address, connection is not possible!', 'no-mac'],
    ['InvalidStateError', 'GATT operation already in progress.', 'busy'],
    ['Error', "Can't find target BLE services - wrong or unsupported cube device model", 'unsupported'],
  ];
  for (const [name, message, want] of cases) {
    const err = Object.assign(new Error(message), { name });
    const read = readConnectFailure(err);
    check('reads ' + want + ': ' + message.slice(0, 34), read.kind === want, read.kind);
  }
  // Every failure but a dismissed chooser has to leave something on screen
  const asleep = readConnectFailure(Object.assign(new Error('Connection Error'), { name: 'NetworkError' }));
  check('an unreachable cube says what to do', /turn/i.test(asleep.message), asleep.message);
  check('a dismissed chooser says nothing', readConnectFailure(Object.assign(new Error('User cancelled'), { name: 'NotFoundError' })).message === '');
  check('an unrecognised error still reports itself', readConnectFailure(new Error('weird thing')).message === 'weird thing');
}

/* ---- The end-of-solve budget asks sooner, and keeps asking longer ---- */
{
  // The idle budget protects the link during a solve. The finish budget has a
  // different job: a solve has ended and turns may be stuck in the library's
  // buffer, and only a facelets request shakes them loose.
  const idle = new CommandBudget(1500, 4);
  const finish = new CommandBudget(600, 6);

  // Both are refilled by the last move of the solve
  idle.refill(0);
  finish.refill(0);

  check('the idle budget will not ask at 600ms', !idle.take(600));
  check('the finish budget asks at 600ms', finish.take(600));

  // How long before each one has asked at all — the gap that left the clock running
  const firstAsk = (b: CommandBudget, from: number) => {
    for (let t = from; t <= from + 4000; t += 50) if (b.take(t)) return t - from;
    return Infinity;
  };
  const a = new CommandBudget(1500, 4); a.refill(0);
  const f = new CommandBudget(600, 6); f.refill(0);
  check('idle first asks at 1500ms', firstAsk(a, 0) === 1500, String(firstAsk(a, 0)));
  check('finish first asks at 600ms', firstAsk(f, 0) === 600, String(firstAsk(f, 0)));

  // And it does not give up as quickly: six tries at 600ms covers ~3.6s
  const g = new CommandBudget(600, 6);
  g.refill(0);
  let asks = 0;
  for (let t = 600; t <= 6000; t += 100) if (g.take(t)) asks++;
  check('the finish budget asks six times then stops', asks === 6, String(asks));

  // A move mid-wait means the hands are back on the cube: start over
  const h = new CommandBudget(600, 6);
  h.refill(0);
  for (let t = 600; t <= 3600; t += 600) h.take(t);
  check('spent after six asks', !h.take(4200));
  h.refill(4300); // a move arrived
  check('a move gives the finish budget back', h.take(4900));
}

/* ---- How far behind the cube is, read off the serial numbers ---- */
{
  // The cube's move counter wraps at 256. A facelets packet carries it, and the
  // difference from the last move handed to us is how many turns are held back.
  const behind = (cubeSerial: number, lastMove: number) => (((cubeSerial - lastMove) % 256) + 256) % 256;
  check('in step means nothing outstanding', behind(40, 40) === 0);
  check('one turn held back', behind(41, 40) === 1);
  check('three turns held back', behind(43, 40) === 3);
  check('counts across the wrap at 255', behind(1, 254) === 3, String(behind(1, 254)));
  check('a stale snapshot does not read as 255 behind', behind(39, 40) === 255);
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);