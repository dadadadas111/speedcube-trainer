/**
 * Two small rules that keep the bluetooth link alive, kept apart from the
 * connection itself so they can be tested without a cube or a browser.
 *
 * Both guard against the same symptom — the cube simply stops responding —
 * from opposite directions: too much traffic going out, and an exception
 * coming back in.
 */

/**
 * How often the app is allowed to ask the cube for something.
 *
 * Every request is a GATT write. A cube written to several times a second can
 * drop the link outright, and the timer polls while the hands are still, so
 * that has to be held back: one request per `minGapMs`, and only `maxInARow`
 * of them before giving up until something happens again.
 */
export class CommandBudget {
  private lastAt = -Infinity;
  private used = 0;

  constructor(
    private readonly minGapMs: number,
    private readonly maxInARow: number,
  ) {}

  /** May a poll be sent now? Records it if so. */
  take(now: number): boolean {
    if (now - this.lastAt < this.minGapMs) return false;
    if (this.used >= this.maxInARow) return false;
    this.used++;
    this.lastAt = now;
    return true;
  }

  /** The cube did something, so it is listening: allow polling again. */
  refill(now: number) {
    this.used = 0;
    this.lastAt = now;
  }

  /** A request the user asked for: it goes out whatever the budget says. */
  spendFreely(now: number) {
    this.used = 0;
    this.lastAt = now;
  }
}

/**
 * Call every listener, and never let one of them take the others down.
 *
 * These callbacks are React handlers. An exception from one used to escape
 * into the cube's event stream, which is no place for it: a render bug would
 * silently stop every later move from arriving and look exactly like the cube
 * disconnecting. The list is copied first because a listener may unsubscribe
 * while being called.
 */
export function notifyAll<L>(listeners: Iterable<L>, fn: (l: L) => void, onError: (err: unknown) => void): void {
  for (const l of [...listeners]) {
    try {
      fn(l);
    } catch (err) {
      onError(err);
    }
  }
}
