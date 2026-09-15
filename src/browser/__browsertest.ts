/**
 * Keeping the screen on: the counting, and the re-asking after the browser has
 * quietly taken the lock away.
 */

import { ScreenLock, type Releasable } from './wakeLock';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

/** A browser that hands out locks and remembers how many it let go of. */
function fakeBrowser(answer: 'yes' | 'no' = 'yes') {
  let granted = 0, released = 0;
  const request = async (): Promise<Releasable | null> => {
    if (answer === 'no') return null;
    granted++;
    return { release: async () => { released++; } };
  };
  return { request, get granted() { return granted; }, get released() { return released; } };
}

/* ---- One holder ---- */
{
  const br = fakeBrowser();
  const lock = new ScreenLock(br.request);
  const off = lock.hold();
  await lock.sync();
  check('asking once takes a lock', lock.held && br.granted === 1);
  off();
  await lock.sync();
  check('letting go releases it', !lock.held && br.released === 1);
}

/* ---- Two holders: the bridge and the app both want it ---- */
{
  const br = fakeBrowser();
  const lock = new ScreenLock(br.request);
  const a = lock.hold(); await lock.sync();
  const b = lock.hold(); await lock.sync();
  check('a second holder does not ask again', br.granted === 1, String(br.granted));
  a(); await lock.sync();
  check('one letting go keeps the screen on', lock.held && br.released === 0);
  b(); await lock.sync();
  check('the last one releases it', !lock.held && br.released === 1);
}

/* ---- A cleanup that runs twice must not drop somebody else's lock ---- */
{
  const br = fakeBrowser();
  const lock = new ScreenLock(br.request);
  const a = lock.hold();
  const b = lock.hold();
  await lock.sync();
  a(); a(); a();
  await lock.sync();
  check('releasing the same hold again changes nothing', lock.holders === 1, String(lock.holders));
  check('and the screen is still held', lock.held);
  b(); await lock.sync();
  check('now it is let go', !lock.held);
}

/* ---- The browser takes it back whenever the page is hidden ---- */
{
  const br = fakeBrowser();
  const lock = new ScreenLock(br.request);
  lock.hold(); await lock.sync();
  check('held while visible', lock.held && br.granted === 1);
  lock.forget(); // the page was hidden
  check('the browser has it back', !lock.held);
  await lock.sync(); // and the page returns
  check('coming back asks again', lock.held && br.granted === 2, String(br.granted));
}

/* ---- A browser that says no ---- */
{
  const br = fakeBrowser('no');
  const lock = new ScreenLock(br.request);
  const off = lock.hold();
  await lock.sync();
  check('a refusal is not an error', !lock.held);
  off();
  await lock.sync();
  check('and letting go of nothing is fine', lock.holders === 0);
}

/* ---- Letting go while the browser is still thinking ---- */
{
  let resolve: ((r: Releasable | null) => void) | null = null;
  let released = 0;
  const lock = new ScreenLock(() => new Promise((r) => { resolve = r; }));
  const off = lock.hold();
  const pending = lock.sync();
  off(); // gone before the answer comes back
  resolve!({ release: async () => { released++; } });
  await pending;
  await lock.sync();
  check('a lock granted after everyone left is handed straight back', released === 1, String(released));
  check('and is not left held', !lock.held);
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
