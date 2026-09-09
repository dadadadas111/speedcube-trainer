/**
 * Walks the whole LSE group ⟨M, U⟩ to answer one question: does "all 6 edges
 * oriented" already imply "the M slice is aligned"? If it does, the alignment
 * clause in the EO detector is redundant and should go (it could push the EO
 * boundary later than it really is).
 */
import { SOLVED_STATE, applyMove, toKociemba, LSE_UD_FACELETS, U_CENTER_FACELET } from '../cube/cube';

const GENS = ['M', "M'", 'M2', 'U', "U'", 'U2'];
const seen = new Set<string>([toKociemba(SOLVED_STATE)]);
let frontier = [SOLVED_STATE];
let goodAndMisaligned = 0;
let goodTotal = 0;
let depth = 0;

const allEdgesGood = (s: Uint8Array) => LSE_UD_FACELETS.every((f) => s[f] === 0 || s[f] === 3);
const aligned = (s: Uint8Array) => s[U_CENTER_FACELET] === 0 || s[U_CENTER_FACELET] === 3;

while (frontier.length) {
  const next: Uint8Array[] = [];
  for (const s of frontier) {
    if (allEdgesGood(s)) {
      goodTotal++;
      if (!aligned(s)) goodAndMisaligned++;
    }
    for (const g of GENS) {
      const t = applyMove(s, g);
      const k = toKociemba(t);
      if (!seen.has(k)) { seen.add(k); next.push(t); }
    }
  }
  frontier = next;
  depth++;
  if (depth > 40) break;
}
console.log('total LSE states:', seen.size);
console.log('states with all 6 edges oriented:', goodTotal);
console.log('of those, M slice misaligned:', goodAndMisaligned);
console.log(goodAndMisaligned === 0
  ? '=> The alignment clause is REDUNDANT: orientation already implies alignment.'
  : '=> The alignment clause EARNS its place: there are oriented states with the M slice off.');
