/** Reading a code out loud and typing it in is the whole pairing step. */

import { CODE_ALPHABET, CODE_LENGTH, isValidCode, normalizeCode } from './protocol';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

check('the alphabet leaves out every character that gets misread',
  !/[01OIL]/.test(CODE_ALPHABET), CODE_ALPHABET);
check('a code is short enough to read out', CODE_LENGTH <= 6);
check('and long enough not to be stumbled on',
  Math.pow(CODE_ALPHABET.length, CODE_LENGTH) > 100_000_000,
  String(Math.pow(CODE_ALPHABET.length, CODE_LENGTH)));

check('a real code is accepted', isValidCode('ABC234'));
check('the wrong length is not', !isValidCode('ABC23') && !isValidCode('ABC2345'));
check('a character outside the alphabet is not', !isValidCode('ABC23O'));

// What someone typing on a phone actually produces
for (const [typed, want] of [
  ['abc234', 'ABC234'],
  ['ABC 234', 'ABC234'],
  ['abc-234', 'ABC234'],
  ['  ABC234  ', 'ABC234'],
] as const) {
  check(`reads ${JSON.stringify(typed)}`, normalizeCode(typed) === want, String(normalizeCode(typed)));
}

check('a misread character is refused rather than guessed at', normalizeCode('ABC23O') === null);
check('half a code is refused', normalizeCode('ABC') === null);
check('an empty box is refused', normalizeCode('') === null);
check('a code with something extra typed after it is refused', normalizeCode('ABC2345') === null);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
