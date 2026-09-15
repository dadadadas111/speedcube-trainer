/** Hold the screen awake for as long as `active` is true. */

import { useEffect } from 'react';
import { screenLock } from './wakeLock';

export function useScreenAwake(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return screenLock.hold();
  }, [active]);
}
