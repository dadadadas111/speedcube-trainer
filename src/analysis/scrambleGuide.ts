/**
 * Guiding the user through a scramble from the solved state.
 *
 * Matching uses the rotation-invariant key, so you may hold the cube however you
 * like: just perform the notation in your own frame of reference. The key is
 * still colour-aware, so turning the wrong face (orange instead of red, say) is
 * caught immediately.
 *
 * There are three states, not two. A cube reports a half turn as TWO separate
 * quarter-turn events, so halfway through a U2 the cube state matches no step at
 * all. With only right/wrong the screen would flash red mid-turn on every U2 or
 * R2, which is maddening. Hence: right face but not far enough around is
 * "partial" (amber), and only touching a different face counts as wrong (red).
 */

import { SOLVED_STATE, applyMove, canonicalKey, stateSequence, type CubeState } from '../cube/cube';
import { invertAlg, simplifyAlg, moveFace, moveAmount, makeMove } from '../cube/alg';

export type ScrambleStatus =
  /** Neither solved nor matching any step — needs a resync or a fresh solve */
  | 'unknown'
  /** On track, not finished yet */
  | 'on-track'
  /** Turning the right face but not far enough yet (half of a U2, say) */
  | 'partial'
  /** The whole scramble is done */
  | 'complete'
  /** Wrong turn, needs backing out */
  | 'off-track';

export interface ScrambleProgress {
  status: ScrambleStatus;
  /** How many scramble moves are correctly done */
  done: number;
  total: number;
  /** The next move to make; null when finished or off track */
  next: string | null;
  /** While partial: how much further to turn that same face */
  remaining: string | null;
  /** The sequence that gets back on track (only when off track) */
  fix: string[];
  /** How many wrong moves since going off track */
  wrongMoves: number;
}

export class ScrambleTracker {
  private keys: string[];
  /**
   * Per step, the "partly turned" states of that same face: key -> what is
   * still missing. For a U2 step, one U is halfway there and one U remains.
   */
  private partials: Map<string, string>[];
  /** Moves made since the last correct position */
  private strayMoves: string[] = [];
  private done = 0;
  private lost = false;
  private partialRemaining: string | null = null;

  constructor(
    private scramble: string[],
    base: CubeState = SOLVED_STATE,
  ) {
    const states = stateSequence(base, scramble);
    this.keys = states.map(canonicalKey);
    this.partials = scramble.map((move, i) => {
      const face = moveFace(move);
      const want = moveAmount(move);
      const map = new Map<string, string>();
      for (let turned = 1; turned <= 3; turned++) {
        if (turned === want) continue; // a full turn is simply the next step
        const partial = makeMove(face, turned);
        const remaining = makeMove(face, want - turned);
        if (!partial || !remaining) continue;
        map.set(canonicalKey(applyMove(states[i], partial)), remaining);
      }
      return map;
    });
  }

  get total() {
    return this.scramble.length;
  }

  /**
   * Feed the cube state after each move. `move` is the turn just made, when
   * known, and is used to build the correction hint. Call without `move` when
   * merely resyncing the state.
   */
  update(state: CubeState, move?: string): ScrambleProgress {
    const key = canonicalKey(state);

    // Prefer the immediate next step before searching wider, so we do not jump
    // around if a scramble happens to revisit the same state twice.
    let found = -1;
    if (this.keys[this.done + 1] === key) found = this.done + 1;
    else if (this.keys[this.done] === key) found = this.done;
    else found = this.keys.indexOf(key);

    if (found >= 0) {
      this.done = found;
      this.strayMoves = [];
      this.lost = false;
      this.partialRemaining = null;
      return this.snapshot();
    }

    // Partway through the right face for this step is not an error yet
    const remaining = this.partials[this.done]?.get(key);
    if (remaining) {
      this.partialRemaining = remaining;
      this.lost = false;
      this.strayMoves = move ? [...this.strayMoves, move] : this.strayMoves;
      return this.snapshot();
    }

    if (move) this.strayMoves.push(move);
    this.partialRemaining = null;
    this.lost = true;
    return this.snapshot();
  }

  /** Forget all history and start over from the current state. */
  reset(state: CubeState): ScrambleProgress {
    this.done = 0;
    this.strayMoves = [];
    this.lost = false;
    this.partialRemaining = null;
    return this.update(state);
  }

  private snapshot(): ScrambleProgress {
    const base = {
      done: this.done,
      total: this.total,
      next: this.done < this.total ? this.scramble[this.done] : null,
      remaining: null as string | null,
      fix: [] as string[],
      wrongMoves: 0,
    };

    if (this.lost) {
      return {
        ...base,
        status: 'off-track',
        next: null,
        // If we know what was turned wrongly, undoing it is enough. If we do
        // not (a dropped connection), tell the user to solve and start over.
        fix: this.strayMoves.length ? simplifyAlg(invertAlg(this.strayMoves)) : [],
        wrongMoves: this.strayMoves.length,
      };
    }
    if (this.partialRemaining) {
      return { ...base, status: 'partial', remaining: this.partialRemaining };
    }
    if (this.done >= this.total) {
      return { ...base, status: 'complete', next: null };
    }
    return { ...base, status: 'on-track' };
  }

  /** The current progress without feeding anything new. */
  peek(): ScrambleProgress {
    return this.snapshot();
  }
}

/**
 * Is the cube solved, regardless of how it is held?
 * Used to know whether we are ready to start scrambling.
 */
export function isAtStart(state: CubeState, base: CubeState = SOLVED_STATE): boolean {
  return canonicalKey(state) === canonicalKey(base);
}
