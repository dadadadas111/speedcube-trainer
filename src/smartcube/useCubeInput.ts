/** Merges the two input sources: a real smart cube and the keyboard cube. */

import { useEffect, useRef } from 'react';
import { cubeLink, type LiveMove } from './connection';
import { virtualCube } from './virtual';
import type { CubeState } from '../cube/cube';

export interface CubeInputHandlers {
  onMove?: (m: LiveMove, state: CubeState) => void;
  onState?: (state: CubeState, fromCube: boolean) => void;
}

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
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (virtualCube.handleKey(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard]);
}

/** The active state source: the virtual cube when enabled, otherwise the real one. */
export function currentCubeState(keyboard: boolean): CubeState {
  return keyboard ? virtualCube.getState() : cubeLink.getState();
}
