/**
 * Turning D four times as a way of saying "this cube is solved".
 *
 * When the app and the cube disagree there are buttons for it, but they are
 * buttons: you have to put the cube down, find the mouse, and come back. Four
 * quarter turns of the same face is a gesture the cube itself can carry — and
 * it is safe precisely because it is pointless. D D D D leaves the cube exactly
 * as it was, so nobody ever does it while solving or scrambling, and there is
 * nothing to confuse it with.
 *
 * It only fires when the four turns run together with nothing in between and
 * inside a few seconds, so turns that happen to accumulate across a solve
 * cannot add up to it.
 */

/** All four turns must land inside this, or it is not a deliberate gesture. */
const WINDOW_MS = 2500;
const NEEDED = 4;

export class ResetGesture {
  private runs: { move: string; t: number }[] = [];

  constructor(
    private readonly face = 'D',
    private readonly needed = NEEDED,
    private readonly windowMs = WINDOW_MS,
  ) {}

  /**
   * Feed each move as it arrives. Returns true on the move that completes the
   * gesture, and resets, so it fires once rather than on every turn after.
   */
  push(move: string, t: number): boolean {
    // Anything that is not a quarter turn of the face breaks the run — half
    // turns included, since D2 D2 is a different thing to have done on purpose.
    if (move !== this.face && move !== `${this.face}'`) {
      this.runs = [];
      return false;
    }
    // A change of direction starts a new run: D D' is undoing, not gesturing
    if (this.runs.length && this.runs[this.runs.length - 1].move !== move) {
      this.runs = [];
    }
    // A timestamp that is not a number makes every comparison false, which
    // would leave the window open forever and let four turns minutes apart
    // count as a gesture.
    const at = Number.isFinite(t) ? t : 0;
    this.runs.push({ move, t: at });
    while (this.runs.length && at - this.runs[0].t > this.windowMs) this.runs.shift();
    if (this.runs.length >= this.needed) {
      this.runs = [];
      return true;
    }
    return false;
  }

  reset() {
    this.runs = [];
  }
}
