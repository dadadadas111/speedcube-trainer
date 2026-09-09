import { isFreshSerial } from '../smartcube/serial';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

check('with no reference, everything is accepted', isFreshSerial(0, null) && isFreshSerial(200, null));
check('the same serial is still fresh', isFreshSerial(50, 50));
check('one tick newer', isFreshSerial(51, 50));
check('many ticks newer', isFreshSerial(120, 50));
check('one tick older -> dropped', !isFreshSerial(49, 50));
check('many ticks older -> dropped', !isFreshSerial(10, 50));

// Wrapping 255 -> 0 is normal and must not be read as going backwards
check('wrap 255 -> 0 is newer', isFreshSerial(0, 255));
check('wrap 250 -> 5 is newer', isFreshSerial(5, 250));
check('reverse wrap 0 -> 255 is older', !isFreshSerial(255, 0));
check('reverse wrap 5 -> 250 is older', !isFreshSerial(250, 5));

// The scenario that caused the bug: mid-solve, the cube pushes a snapshot a few moves stale
check('a snapshot 3 moves stale is dropped', !isFreshSerial(97, 100));
check('a snapshot at the current move is accepted', isFreshSerial(100, 100));

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
