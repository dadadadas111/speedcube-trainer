import { normalizeMac } from '../smartcube/mac';
import { recordCrash, recentCrashes, clearCrashes, formatCrash } from '../store/crashLog';
import { SOLVED_STATE, isPlausibleState, fromKociemba, applyMoves, cloneState } from '../cube/cube';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

// Accept every way people type a MAC
const wanted = 'AB:CD:EF:12:34:56';
for (const input of ['AB:CD:EF:12:34:56', 'ab:cd:ef:12:34:56', 'AB-CD-EF-12-34-56', 'abcdef123456', 'AB CD EF 12 34 56', ' ab:CD-ef 12:34:56 ']) {
  check('reads MAC: ' + JSON.stringify(input), normalizeMac(input) === wanted, String(normalizeMac(input)));
}
for (const bad of ['', 'AB:CD:EF:12:34', 'AB:CD:EF:12:34:56:78', 'not-a-mac', 'GHIJKL123456']) {
  check('rejects bad MAC: ' + JSON.stringify(bad), normalizeMac(bad) === null, String(normalizeMac(bad)));
}

// Block garbage data caused by a wrong MAC
check('a solved cube is plausible', isPlausibleState(SOLVED_STATE));
check('a scrambled cube is plausible', isPlausibleState(applyMoves(SOLVED_STATE, ['R', 'U', "F'", 'D2'])));
{
  const garbage = cloneState(SOLVED_STATE);
  garbage[0] = 1; // one red too many, one white too few
  check('wrong colour counts are rejected', !isPlausibleState(garbage));
}
{
  // valid characters but nonsense colour counts — typical garbage from a wrong key
  const junk = fromKociemba('U'.repeat(54));
  check('an all-one-colour string is rejected', !isPlausibleState(junk));
}
check('fromKociemba throws on unknown characters', (() => {
  try { fromKociemba('X'.repeat(54)); return false; } catch { return true; }
})());

/* ---- Crashes survive the reload that follows them ---- */
{
  // A tiny stand-in for the browser's storage, since this runs in node
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;

  clearCrashes();
  check('nothing recorded yet', recentCrashes().length === 0);
  recordCrash('boom', '/training', 'at thing()');
  const [first] = recentCrashes();
  check('a crash is kept', first?.message === 'boom', String(first?.message));
  check('with where it happened', first?.where === '/training');
  check('and it is readable', /boom/.test(formatCrash(first)) && /training/.test(formatCrash(first)));

  recordCrash('second', '/timer', '');
  check('newest comes first', recentCrashes()[0].message === 'second');
  for (let i = 0; i < 10; i++) recordCrash('n' + i, '/x', '');
  check('the list is capped at five', recentCrashes().length === 5, String(recentCrashes().length));
  check('and holds the five newest', recentCrashes()[0].message === 'n9');

  // Storage that refuses to play must not take the page down a second time
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
    removeItem: () => { throw new Error('denied'); },
  } as unknown as Storage;
  let threw = false;
  try { recordCrash('x', 'y', 'z'); clearCrashes(); } catch { threw = true; }
  check('a logger that cannot write stays quiet', !threw);
  check('and reading it returns nothing rather than throwing', recentCrashes().length === 0);
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
