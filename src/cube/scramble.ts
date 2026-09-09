/**
 * Scramble generation. Prefers random-state (WCA standard) from cubing.js when
 * it loads, otherwise falls back to random-move, which is fine for practice.
 */

import { parseAlg } from './alg';

const FACES = ['U', 'D', 'R', 'L', 'F', 'B'];
const AXIS: Record<string, number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
const SUFFIX = ['', "'", '2'];

export function randomMoveScramble(length = 22): string[] {
  const out: string[] = [];
  let lastFace = '';
  let prevFace = '';
  while (out.length < length) {
    const face = FACES[Math.floor(Math.random() * 6)];
    if (face === lastFace) continue;
    // avoid R L R shapes (same axis, repeated face) since they can be reduced
    if (AXIS[face] === AXIS[lastFace] && face === prevFace) continue;
    prevFace = lastFace;
    lastFace = face;
    out.push(face + SUFFIX[Math.floor(Math.random() * 3)]);
  }
  return out;
}

type RandomScrambleFn = (event: string) => Promise<{ toString(): string }>;
let randomStateFn: RandomScrambleFn | null | undefined;

/** Loaded dynamically; returns null on failure so the caller falls back. */
async function tryRandomState(): Promise<string[] | null> {
  try {
    if (randomStateFn === undefined) {
      // cubing.js tries three ways to spawn its worker, in order. The default
      // relies on `import.meta.resolve`, which bundlers do not handle. The
      // "esbuild" route imports the worker module and reads the URL it declares
      // for itself — exactly what a bundler can rewrite — so the built app finds
      // the worker file even after it was renamed with a content hash.
      const [mod, search] = await Promise.all([import('cubing/scramble'), import('cubing/search')]);
      search.setSearchDebug({ prioritizeEsbuildWorkaroundForWorkerInstantiation: true });
      randomStateFn = mod.randomScrambleForEvent as unknown as RandomScrambleFn;
    }
    if (!randomStateFn) return null;
    const alg = await randomStateFn('333');
    const moves = parseAlg(alg.toString());
    return moves.length ? moves : null;
  } catch (err) {
    console.warn('Random-state scrambles unavailable, falling back to random-move.', err);
    randomStateFn = null;
    return null;
  }
}

export type ScrambleSource = 'random-state' | 'random-move';

export interface Scramble {
  moves: string[];
  /**
   * Which generator actually produced this. Returned so the UI can say when it
   * fell back — this used to degrade to random-move with nobody noticing.
   */
  source: ScrambleSource;
}

export async function generateScramble(preferRandomState = true): Promise<Scramble> {
  if (preferRandomState) {
    const rs = await tryRandomState();
    if (rs && rs.length) return { moves: rs, source: 'random-state' };
  }
  return { moves: randomMoveScramble(), source: 'random-move' };
}
