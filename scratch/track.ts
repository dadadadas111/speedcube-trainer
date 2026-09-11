import { MOVE_PERMS } from '../src/cube/geometry';
import { SOLVED_STATE, applyMoves, toKociemba } from '../src/cube/cube';

// applyPerm does out[i] = s[perm[i]] — so the sticker at perm[i] ends up at i.
// Therefore a sticker at position p moves to the i where perm[i] === p.
const inv = (p: Uint8Array) => { const o = new Uint8Array(54); for (let i = 0; i < 54; i++) o[p[i]] = i; return o; };

// Track where facelet 0 (a U sticker) goes under "U", and check against colours
const state = applyMoves(SOLVED_STATE, ['R']);
const k = toKociemba(state);
const invR = inv(MOVE_PERMS['R']);
// facelet 20 is on the F face top-right (index 18+2); after R it should move to U
let bad = 0;
for (let f = 0; f < 54; f++) {
  const to = invR[f];
  // the colour originally at f must now be found at position `to`
  if (k[to] !== 'URFDLB'[Math.floor(f / 9)]) bad++;
}
console.log(bad === 0 ? 'tracking direction confirmed: newPos = inv[oldPos]' : `WRONG: ${bad} mismatches`);
