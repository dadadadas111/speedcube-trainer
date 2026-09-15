/**
 * CMLL on its own: a scramble that leaves both blocks standing, and knowing
 * when the corners are done without caring about the edges.
 *
 * Drilling a case by being shown the case teaches you the algorithm and
 * nothing else. Recognition — the half that actually costs time — only gets
 * trained when you meet the case the way you meet it in a solve: you scramble,
 * you look, and nobody has told you what it is. So this deals scrambles rather
 * than cases, exactly as the timer does.
 *
 * The other half is knowing when to stop. A CMLL attempt ends with the corners
 * solved and the last six edges still anywhere at all, so waiting for a solved
 * cube would be waiting for work that is not being practised.
 */

import { ROTATIONS_WITH_AUF, ROUX_STAGES } from './method';
import { invertAlg, simplifyMoves } from '../cube/alg';
import { applyMoves, SOLVED_STATE, type CubeState } from '../cube/cube';

const CMLL_TEST = ROUX_STAGES.find((s) => s.key === 'CMLL')!.test;

/**
 * Both blocks built and the four top corners solved, edges ignored.
 *
 * Tested against every orientation AND every U turn, for two different
 * reasons. The orientations are because nobody drills holding the cube the way
 * the app happens to draw it. The U turns are because after CMLL the top layer
 * is still turned freely all through the last six edges — corners "solved but
 * rotated" is a finished CMLL, not an unfinished one.
 */
export function cmllDone(state: CubeState): boolean {
  return ROTATIONS_WITH_AUF.some((rot) => CMLL_TEST(state, rot));
}

/** Turns that move nothing in either block: the top layer and the M slice. */
const FREE_MOVES = ['U', "U'", 'U2', 'M', "M'", 'M2'];

export interface Rng {
  (): number;
}

/** A run of top-layer and slice turns, with no move immediately repeated. */
export function freeTurns(count: number, rng: Rng = Math.random): string[] {
  const out: string[] = [];
  let lastFace = '';
  for (let i = 0; i < count; i++) {
    const choices = FREE_MOVES.filter((m) => m[0] !== lastFace);
    const pick = choices[Math.floor(rng() * choices.length) % choices.length];
    out.push(pick);
    lastFace = pick[0];
  }
  return out;
}

/**
 * A scramble that sets up the case this algorithm solves.
 *
 * Running the algorithm backwards from solved reaches its case, and that alone
 * would work — but it would also be the answer written out, and anyone who has
 * drilled for a week would read it. So the same turns are buried between runs
 * of U and M, which change the edges and the angle you meet the case from
 * without changing which case it is, and the whole thing is then cancelled
 * down. What survives no longer looks like an algorithm reversed.
 *
 * U and M are the only turns used around it because they are the only ones
 * that cannot disturb either block.
 */
export function cmllScramble(alg: string[], rng: Rng = Math.random): string[] {
  const lead = 3 + Math.floor(rng() * 4);
  const tail = 3 + Math.floor(rng() * 4);
  return simplifyMoves([...freeTurns(lead, rng), ...invertAlg(alg), ...freeTurns(tail, rng)]);
}

/**
 * A scramble for this algorithm's case that is not already finished.
 *
 * The turns around the algorithm can cancel it out, rarely but not never, and
 * being handed a case that is already solved reads as a bug.
 */
export function cmllScrambleFor(alg: string[], rng: Rng = Math.random, tries = 12): string[] | null {
  for (let i = 0; i < tries; i++) {
    const scramble = cmllScramble(alg, rng);
    if (!scramble.length) continue;
    const state = applyMoves(SOLVED_STATE, scramble);
    if (!cmllDone(state)) return scramble;
  }
  return null;
}

export interface DealtCase<T> {
  /** The library entry this scramble was built from */
  entry: T;
  scramble: string[];
}

/**
 * Pick a case and build its scramble.
 *
 * Uniform over whatever pool it is given, so "everything" and "just the Sunes"
 * are the same code with a different list.
 */
export function dealCmll<T extends { alg: string }>(
  pool: T[],
  parse: (alg: string) => string[],
  rng: Rng = Math.random,
): DealtCase<T> | null {
  if (!pool.length) return null;
  // A few goes, in case one entry cannot be parsed or keeps cancelling out
  for (let i = 0; i < 8; i++) {
    const entry = pool[Math.floor(rng() * pool.length) % pool.length];
    let moves: string[];
    try {
      moves = parse(entry.alg);
    } catch {
      continue;
    }
    const scramble = cmllScrambleFor(moves, rng);
    if (scramble) return { entry, scramble };
  }
  return null;
}
