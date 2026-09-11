/**
 * A keyboard-driven virtual cube, for trying the app before pairing a smart
 * cube and for testing. It emits exactly the same events as a real one.
 */

import { SOLVED_STATE, applyMove, cloneState, type CubeState } from '../cube/cube';
import type { LiveMove } from './connection';

/** A plain key is a clockwise turn; hold Shift for a half turn. */
export const KEYMAP: Record<string, string> = {
  j: 'U', f: "U'",
  i: 'R', k: "R'",
  d: 'L', e: "L'",
  h: 'F', g: "F'",
  w: 'B', o: "B'",
  s: 'D', l: "D'",
  ';': 'M', a: "M'",
  p: 'r', q: "r'",
};

export const KEYMAP_HELP: [string, string][] = [
  ['j / f', "U / U'"],
  ['i / k', "R / R'"],
  ['d / e', "L / L'"],
  ['h / g', "F / F'"],
  ['w / o', "B / B'"],
  ['s / l', "D / D'"],
  ['; / a', "M / M'"],
  ['p / q', "r / r'"],
];

type Listener = {
  move?: (m: LiveMove, state: CubeState) => void;
  state?: (s: CubeState, fromCube: boolean) => void;
  /** The keyboard cube was switched on or off */
  active?: (on: boolean) => void;
};

class VirtualCube {
  private state: CubeState = cloneState(SOLVED_STATE);
  private listeners = new Set<Listener>();
  /** True while keys are driving this cube */
  active = false;

  /**
   * Switched on or off. Worth announcing: a phone bridging to a computer has
   * to tell it something appeared on this end, and the keyboard cube has no
   * connect step of its own to hang that on.
   */
  setActive(on: boolean) {
    if (this.active === on) return;
    this.active = on;
    for (const l of [...this.listeners]) {
      try {
        l.active?.(on);
      } catch {
        /* a listener must not break the others */
      }
    }
  }

  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  getState(): CubeState {
    return this.state;
  }

  setState(s: CubeState) {
    this.state = s;
    for (const l of this.listeners) l.state?.(s, true);
  }

  reset() {
    this.setState(cloneState(SOLVED_STATE));
  }

  /** Perform a move as though the user just turned the cube. */
  push(move: string, at = performance.now()) {
    this.state = applyMove(this.state, move);
    const lm: LiveMove = {
      move,
      localTs: at,
      cubeTs: at,
      raw: { face: 0, direction: 0, move, localTimestamp: at, cubeTimestamp: at },
    };
    for (const l of this.listeners) l.move?.(lm, this.state);
    for (const l of this.listeners) l.state?.(this.state, false);
  }

  /** Turn a key event into a move; returns the move performed, or null. */
  handleKey(e: KeyboardEvent): string | null {
    if (e.ctrlKey || e.metaKey || e.altKey) return null;
    const base = KEYMAP[e.key.toLowerCase()];
    if (!base) return null;
    const move = e.shiftKey ? base.replace(/'?$/, '2').replace("'2", '2') : base;
    this.push(move);
    return move;
  }
}

export const virtualCube = new VirtualCube();
