/**
 * Khối ảo điều khiển bằng bàn phím — để dùng thử app khi chưa pair smart cube,
 * và để kiểm thử. Phát ra đúng loại sự kiện như khối thật.
 */

import { SOLVED_STATE, applyMove, cloneState, type CubeState } from '../cube/cube';
import type { LiveMove } from './connection';

/** Phím thường = nước thuận, giữ Shift = nước 180. */
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
};

class VirtualCube {
  private state: CubeState = cloneState(SOLVED_STATE);
  private listeners = new Set<Listener>();

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

  /** Thực hiện một nước như thể người dùng vừa vặn khối. */
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

  /** Chuyển sự kiện bàn phím thành nước; trả về nước đã thực hiện hoặc null. */
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
