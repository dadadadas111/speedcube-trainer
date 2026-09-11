/**
 * Showing a turn happening, rather than the cube jumping to the next position.
 *
 * The cube reports a move once it is done, so the state in hand is already the
 * one after it. To show the turn, the cube has to keep displaying where it WAS
 * for the length of the animation, with the layer swinging round; only then
 * does it settle onto the new position.
 *
 * Hands beat animation during a fast solve, so a move arriving mid-turn lands
 * the previous one immediately and starts from there. The cube can lag by one
 * turn; it must never lag by five.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { SOLVED_STATE, cloneState, type CubeState } from '../cube/cube';

/** Short enough to keep up with a solve, long enough for the eye to catch. */
const TURN_MS = 110;

/**
 * A turn must never be able to strand the cube at the position before it.
 *
 * requestAnimationFrame does not run in a hidden or fully covered tab, and the
 * frames are the only thing that moves the display forward. Without a fallback,
 * one missed frame leaves the cube showing the previous position until some
 * other event happens to correct it — and a real cube sends a full state only
 * now and then, so "now and then" can be a very long time. A timer keeps
 * running where frames do not, so it settles the turn regardless.
 */
const SETTLE_MS = 500;

export interface TurnAnimation {
  /** The state to draw — the one before the turn while it is running */
  shown: CubeState;
  /** The turn in progress, for the renderer */
  animate: { move: string; progress: number } | null;
  /** A move happened; show the layer turning into the state that follows it */
  turn: (move: string, after: CubeState) => void;
  /** A state arrived with no move behind it (a resync): just show it */
  jump: (state: CubeState) => void;
}

export function useTurnAnimation(): TurnAnimation {
  const [shown, setShown] = useState<CubeState>(() => cloneState(SOLVED_STATE));
  const [animate, setAnimate] = useState<{ move: string; progress: number } | null>(null);
  const raf = useRef(0);
  const guard = useRef(0);
  const target = useRef<CubeState>(shown);

  const stop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
    if (guard.current) clearTimeout(guard.current);
    guard.current = 0;
  }, []);

  const turn = useCallback(
    (move: string, after: CubeState) => {
      stop();
      const from = target.current;
      target.current = after;
      setShown(from);
      const settle = () => {
        stop();
        setAnimate(null);
        setShown(target.current);
      };
      const t0 = performance.now();
      const tick = () => {
        const progress = Math.min(1, (performance.now() - t0) / TURN_MS);
        setAnimate({ move, progress });
        if (progress < 1) raf.current = requestAnimationFrame(tick);
        else settle();
      };
      raf.current = requestAnimationFrame(tick);
      guard.current = window.setTimeout(settle, SETTLE_MS);
    },
    [stop],
  );

  const jump = useCallback(
    (state: CubeState) => {
      stop();
      target.current = state;
      setAnimate(null);
      setShown(state);
    },
    [stop],
  );

  useEffect(() => stop, [stop]);

  return { shown, animate, turn, jump };
}
