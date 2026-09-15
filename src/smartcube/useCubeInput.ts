/** Merges the two input sources: a real smart cube and the keyboard cube. */

import { useEffect, useRef } from 'react';
import { cubeLink, type LiveMove } from './connection';
import { virtualCube } from './virtual';
import { SharedListener } from './shared';
import type { CubeState } from '../cube/cube';

export interface CubeInputHandlers {
  onMove?: (m: LiveMove, state: CubeState) => void;
  onState?: (state: CubeState, fromCube: boolean) => void;
}

/**
 * The keyboard cube's keydown handler, shared by every caller of the hook.
 *
 * One per caller meant that two components using the hook at the same time
 * turned the cube twice per key — which shows up as a scramble guide insisting
 * you made a move you did not make, not as anything resembling a double event.
 */
const keys = new SharedListener(() => {
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (virtualCube.handleKey(e)) e.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
});

/**
 * `keyboard` enables the virtual cube. Handlers are kept in a ref so callers
 * need not memoise their callbacks.
 */
export function useCubeInput(handlers: CubeInputHandlers, keyboard: boolean) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const forward = {
      move: (m: LiveMove, s: CubeState) => ref.current.onMove?.(m, s),
      state: (s: CubeState, fromCube: boolean) => ref.current.onState?.(s, fromCube),
    };
    const offCube = cubeLink.on(forward);
    const offVirtual = keyboard ? virtualCube.on(forward) : null;
    return () => {
      offCube();
      offVirtual?.();
    };
  }, [keyboard]);

  useEffect(() => {
    // Recorded on the cube itself so other parts of the app — the phone bridge,
    // for one — can tell whether keys are currently driving it.
    virtualCube.setActive(keyboard);
    if (!keyboard) return;
    return keys.hold();
  }, [keyboard]);
}

/** The active state source: the virtual cube when enabled, otherwise the real one. */
export function currentCubeState(keyboard: boolean): CubeState {
  return keyboard ? virtualCube.getState() : cubeLink.getState();
}
