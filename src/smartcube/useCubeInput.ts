/** Gộp hai nguồn nhập: smart cube thật và khối ảo bàn phím. */

import { useEffect, useRef } from 'react';
import { cubeLink, type LiveMove } from './connection';
import { virtualCube } from './virtual';
import type { CubeState } from '../cube/cube';

export interface CubeInputHandlers {
  onMove?: (m: LiveMove, state: CubeState) => void;
  onState?: (state: CubeState, fromCube: boolean) => void;
}

/**
 * `keyboard` bật chế độ khối ảo. Handler được giữ trong ref nên component
 * không cần memo hoá callback.
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

/** Nguồn trạng thái đang dùng: khối ảo nếu bật demo, ngược lại là khối thật. */
export function currentCubeState(keyboard: boolean): CubeState {
  return keyboard ? virtualCube.getState() : cubeLink.getState();
}
