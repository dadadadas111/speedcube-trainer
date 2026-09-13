/**
 * Keeping the library from talking the cube to death.
 *
 * gan-web-bluetooth holds incoming moves in a FIFO and will not release any of
 * them past a missing serial number. While that gap is open it asks the cube
 * for the move history — and it does so from `evictMoveBuffer`, which runs on
 * EVERY move event. Turn the cube at five to ten turns a second with a gap open
 * and that is five to ten GATT writes a second, which is the one thing this
 * project already knows will drop a bluetooth link. Lost notifications widen
 * the gap, the widened gap means more writes, and at seventeen buffered moves
 * the library gives up and calls `conn.disconnect()` itself. From the outside
 * that looks exactly like the cube disconnecting on its own.
 *
 * There is no upstream fix — 3.0.2 is the last release, from August 2024 — and
 * the buffer is a plain property on the driver, so this reaches in. Two rules:
 *
 *   - While a gap is open, space out the library's writes so the cube is not
 *     flooded and its history reply has room to arrive.
 *   - If the buffer still climbs towards the point of no return, throw the
 *     stuck moves away and take the cube's own position instead. A hole in one
 *     solve's move list beats losing the link and every solve after it.
 *
 * Neither rule does anything while the buffer is empty, which is all of the
 * time in normal use.
 */

/** The parts of the library's protocol driver this needs to touch. */
export interface DriverLike {
  /** Moves held back waiting for a gap to be filled */
  moveBuffer: unknown[];
  /** Serial of the last move the library released */
  lastSerial: number;
  /** The cube's own move counter, as last seen */
  serial: number;
}

export interface GuardLimits {
  /** Buffered moves at which the stuck ones are abandoned */
  rescueAt: number;
  /** Smallest gap between two of the library's own writes, in ms */
  minWriteGapMs: number;
}

export const DEFAULT_LIMITS: GuardLimits = {
  // The library disconnects above sixteen. Ten leaves room for a history reply
  // to land while still stopping well short of that.
  rescueAt: 10,
  // Four writes a second was the flood. This is one.
  minWriteGapMs: 250,
};

/** What the guard decided about a write the library wants to make. */
export type WriteVerdict =
  /** Nothing is stuck; let it through and stay out of the way */
  | 'pass'
  /** A gap is open and this write is too soon after the last one */
  | 'throttle'
  /** Send it, but the buffer is deep enough to want watching */
  | 'allow'
  /** Too deep: abandon the stuck moves rather than lose the link */
  | 'rescue';

export function isDriverLike(d: unknown): d is DriverLike {
  const x = d as DriverLike | null;
  return (
    !!x &&
    Array.isArray(x.moveBuffer) &&
    typeof x.lastSerial === 'number' &&
    typeof x.serial === 'number'
  );
}

export class DriverGuard {
  private lastWriteAt = -Infinity;
  /** How many moves have been thrown away, for the log and for the UI */
  dropped = 0;
  /** How many of the library's writes were held back */
  throttled = 0;

  constructor(private readonly limits: GuardLimits = DEFAULT_LIMITS) {}

  /**
   * Decide what to do about a write the library is about to make.
   *
   * An empty buffer means ordinary traffic — our own requests included — and is
   * always let through untouched.
   */
  judge(driver: DriverLike, now: number): WriteVerdict {
    const depth = driver.moveBuffer.length;
    if (depth === 0) return 'pass';
    if (depth >= this.limits.rescueAt) return 'rescue';
    if (now - this.lastWriteAt < this.limits.minWriteGapMs) {
      this.throttled++;
      return 'throttle';
    }
    this.lastWriteAt = now;
    return 'allow';
  }

  /**
   * Give up on the moves that are stuck and accept the cube's own counter.
   *
   * The library will then consider itself caught up and start releasing moves
   * again. The app's idea of the position is wrong at this point and has to be
   * refreshed from the cube — that is the caller's job.
   *
   * @returns how many moves were thrown away
   */
  rescue(driver: DriverLike): number {
    const lost = driver.moveBuffer.length;
    driver.moveBuffer.length = 0;
    driver.lastSerial = driver.serial;
    this.dropped += lost;
    this.lastWriteAt = -Infinity;
    return lost;
  }

  /** A fresh connection starts with a clean slate. */
  reset() {
    this.lastWriteAt = -Infinity;
    this.dropped = 0;
    this.throttled = 0;
  }
}
