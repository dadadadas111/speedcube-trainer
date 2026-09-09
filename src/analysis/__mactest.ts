import { normalizeMac } from '../smartcube/mac';
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

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
