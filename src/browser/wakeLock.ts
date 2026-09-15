/**
 * Keeping the screen on while your hands are on the cube.
 *
 * A phone decides you have wandered off by watching for taps, and solving is
 * the one activity where touching the screen would be a mistake. So it dims
 * mid-solve, and you lose the timer, the scramble, and your place — which is
 * exactly when it matters.
 *
 * Two things want this at once: a phone bridging its cube to a computer, and a
 * phone being used as the app itself. So the count is kept rather than a
 * boolean, and the lock is only let go when the last holder does.
 *
 * Browsers release the lock themselves whenever the page is hidden and will not
 * hand it back automatically, so it has to be asked for again every time the
 * page comes back — which is the other half of what this is for.
 */

export interface Releasable {
  release(): Promise<void>;
}

/** Ask the browser for a screen lock; null when it has none to give. */
export type RequestLock = () => Promise<Releasable | null>;

/**
 * The browser's own, when it has one. Everything here is wrapped: a refusal is
 * ordinary — an unsupported browser, a page that is not visible, a battery
 * saver that says no — and none of it is worth taking the app down for.
 */
export const browserRequest: RequestLock = async () => {
  try {
    const wl = (
      navigator as unknown as {
        wakeLock?: { request(type: 'screen'): Promise<Releasable> };
      }
    ).wakeLock;
    if (!wl) return null;
    return await wl.request('screen');
  } catch {
    return null;
  }
};

export class ScreenLock {
  private holds = 0;
  private lock: Releasable | null = null;
  /** True while a request is in flight, so two holders do not both ask */
  private asking = false;

  constructor(private readonly request: RequestLock = browserRequest) {}

  /** Is a lock actually held right now? For tests and for saying so on screen. */
  get held(): boolean {
    return this.lock !== null;
  }

  get holders(): number {
    return this.holds;
  }

  /**
   * Ask for the screen to stay on. Call what comes back to stop asking.
   *
   * The returned function is safe to call more than once — a React effect
   * cleanup running twice must not decrement the count twice, or the lock
   * would be dropped while somebody still wants it.
   */
  hold(): () => void {
    this.holds++;
    void this.sync();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.holds = Math.max(0, this.holds - 1);
      void this.sync();
    };
  }

  /**
   * Match the lock to the count.
   *
   * Called again whenever the page becomes visible, because that is when the
   * browser will have quietly taken the lock away.
   */
  async sync(): Promise<void> {
    if (this.holds === 0) {
      const lock = this.lock;
      this.lock = null;
      if (lock) await lock.release().catch(() => {});
      return;
    }
    if (this.lock || this.asking) return;
    this.asking = true;
    try {
      const lock = await this.request();
      // Everyone may have let go while the browser was thinking about it
      if (lock && this.holds === 0) {
        await lock.release().catch(() => {});
        return;
      }
      this.lock = lock;
    } finally {
      this.asking = false;
    }
  }

  /** The browser dropped it on its own; forget it so the next sync re-asks. */
  forget(): void {
    this.lock = null;
  }
}

/** The one the app uses. */
export const screenLock = new ScreenLock();

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void screenLock.sync();
    else screenLock.forget();
  });
}
