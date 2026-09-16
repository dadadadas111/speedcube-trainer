/**
 * When the self-healing poll asks, and — more importantly — when it keeps
 * quiet. Every question is a GATT write, and writing to a cube too often is
 * the thing that drops the link this whole file exists to protect.
 */

import { shouldAsk, STILL_MS, BEHIND_STILL_MS, QUIET_MS } from './healer';

let fails = 0;
const check = (n: string, c: boolean, x = '') => {
  if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n);
};

const ask = (o: Partial<Parameters<typeof shouldAsk>[0]>) =>
  shouldAsk({ now: 100_000, lastMoveAt: 0, lastCommandAt: 0, behind: false, ...o });

/* ---- Not while the cube is being turned ---- */
check('nothing is asked mid-turn', !ask({ lastMoveAt: 100_000 - 50 }));
check('nor just after a turn', !ask({ lastMoveAt: 100_000 - (STILL_MS - 100) }));
check('but once the hands stop, it asks', ask({ lastMoveAt: 100_000 - STILL_MS }));

/* ---- Not on top of the timer's own poll ---- */
// The timer polls fast at the end of a solve on its own budget. If this asked
// as well, the two would add up to a write rate that drops links.
check('it gives way to a question just asked', !ask({ lastCommandAt: 100_000 - 200 }));
check('and to one asked by the timer a second ago', !ask({ lastCommandAt: 100_000 - (QUIET_MS - 1) }));
check('and waits its turn rather than skipping', ask({ lastCommandAt: 100_000 - QUIET_MS }));

/* ---- Unless turns are stuck ---- */
// The cube's counter being ahead means the library is holding moves back, and
// a facelets packet is the only thing that makes it go and fetch them. That is
// worth asking about sooner — but still not mid-turn.
check('a stuck buffer is chased sooner', ask({ lastMoveAt: 100_000 - BEHIND_STILL_MS, behind: true }));
check('the same gap is left alone when nothing is stuck', !ask({ lastMoveAt: 100_000 - BEHIND_STILL_MS }));
check('but even then, not while turning', !ask({ lastMoveAt: 100_000 - 100, behind: true }));
check('and even then, not over another question',
  !ask({ lastMoveAt: 100_000 - 5000, lastCommandAt: 100_000 - 500, behind: true }));

/* ---- A cube that has never moved ---- */
// Straight after connecting, both stamps are 0. The handshake asks for
// facelets itself, so this must not fire a second write on top of it.
check('a fresh connection does not pile on the handshake',
  !shouldAsk({ now: 500, lastMoveAt: 0, lastCommandAt: 300, behind: false }));

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
