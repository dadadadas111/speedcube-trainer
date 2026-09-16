/**
 * The overlay's wire format. Small, but two of these are the difference
 * between a clean overlay and one that shows "null" on stream.
 */

import { decodeState, encodeState, isNewer, isStreamMessage, EMPTY_STATE, type StreamState } from './protocol';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

/* ---- NaN cannot cross JSON ---- */
{
  // An empty session has no averages. Sent raw, JSON turns NaN into null and
  // the overlay prints "null", which looks broken rather than empty.
  const s: StreamState = { ...EMPTY_STATE, seq: 1, ao5: NaN, ao12: NaN, best: NaN, count: 0 };
  const wire = JSON.parse(JSON.stringify(encodeState(s)));
  check('an absent average travels as null', wire.ao5 === null && wire.best === null);
  const back = decodeState(wire)!;
  check('and comes back as NaN', Number.isNaN(back.ao5) && Number.isNaN(back.best));

  const real: StreamState = { ...EMPTY_STATE, seq: 2, ao5: 12345, best: 9876 };
  const roundTrip = decodeState(JSON.parse(JSON.stringify(encodeState(real))))!;
  check('a real average survives', roundTrip.ao5 === 12345 && roundTrip.best === 9876);
}

/* ---- Everything else survives the trip ---- */
{
  const s: StreamState = {
    ...EMPTY_STATE, seq: 7, phase: 'done', session: 'Main', scramble: "R U R'",
    elapsedMs: 0, finalMs: 9870, penalty: '+2', count: 42, goalMs: 10000, goalHits: 5, goalTarget: 10,
    moves: 54, tps: 5.62, pauseRatio: 0.21,
    steps: [{ key: 'FB', label: 'First Block', durationMs: 1720, leadMs: 520 }],
  };
  const back = decodeState(JSON.parse(JSON.stringify(encodeState(s))))!;
  check('the phase survives', back.phase === 'done');
  check('the finished time survives', back.finalMs === 9870);
  check('the penalty survives', back.penalty === '+2');
  check('the steps survive', back.steps.length === 1 && back.steps[0].durationMs === 1720);
  check('the target and the tally survive', back.goalMs === 10000 && back.goalHits === 5);
  check('the goal target survives', back.goalTarget === 10);
  check('the move count and TPS survive', back.moves === 54 && back.tps === 5.62 && back.pauseRatio === 0.21);
  check('the scramble survives', back.scramble === "R U R'");
}

/* ---- An overlay opened before these fields existed ---- */
{
  // OBS keeps a Browser Source alive across app changes, so a state without
  // the newer fields must not leave the goal block dividing by zero
  const old = { seq: 3, phase: 'done', count: 5, goalHits: 2 };
  const back = decodeState(old)!;
  check('a state with no goal target falls back to one', back.goalTarget > 0, String(back.goalTarget));
  check('and to no moves rather than undefined', back.moves === 0 && back.tps === 0);
}

/* ---- Out of order ---- */
{
  const a: StreamState = { ...EMPTY_STATE, seq: 5 };
  const b: StreamState = { ...EMPTY_STATE, seq: 6 };
  check('newer replaces older', isNewer(b, a));
  check('older does not replace newer', !isNewer(a, b));
  check('the same message is not reapplied', !isNewer(a, a));
}

/* ---- A stream message is not a cube event ---- */
{
  check('a stream message is recognised', isStreamMessage({ kind: 'stream', state: { seq: 1 } }));
  check('a cube event is not', !isStreamMessage({ type: 'MOVE', move: 'R' }));
  check('nor is nothing', !isStreamMessage(null));
  check('nor a stream message with no state', !isStreamMessage({ kind: 'stream' }));
  // The bridge and the overlay use the same relay protocol, so this guard is
  // what stops one being fed to the other
  check('a bridge payload is not', !isStreamMessage({ kind: 'cube', event: {} }));
}

/* ---- Rubbish in ---- */
{
  check('a payload with no sequence is refused', decodeState({ phase: 'running' }) === null);
  check('and nothing at all', decodeState(null) === null);
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
