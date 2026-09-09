/**
 * The real cube's orientation, throttled to one update per animation frame.
 * The gyroscope fires around 50 times a second; rendering each one is wasteful.
 */

import { useEffect, useRef, useState } from 'react';
import { cubeLink, type CubeQuaternion } from './connection';

export function useCubeGyro(enabled: boolean): CubeQuaternion | null {
  const [q, setQ] = useState<CubeQuaternion | null>(null);
  const pending = useRef<CubeQuaternion | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setQ(null);
      return;
    }
    const flush = () => {
      frame.current = 0;
      if (pending.current) setQ(pending.current);
    };
    const off = cubeLink.on({
      gyro: (next) => {
        pending.current = next;
        if (!frame.current) frame.current = requestAnimationFrame(flush);
      },
    });
    return () => {
      off();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [enabled]);

  return enabled ? q : null;
}
