/**
 * One listener, however many things are listening.
 *
 * `useCubeInput` attaches a keydown handler so the keyboard cube can be turned.
 * Attaching one per caller looks harmless until two components use the hook at
 * once — and then every key press turns the cube TWICE, which does not announce
 * itself as a double event. It announces itself as a scramble guide insisting
 * you made a move you did not make, and it took tracing a single keystroke to
 * see what had happened.
 *
 * So the handler is attached once and let go when the last holder does, exactly
 * as the screen wake lock counts its holders. Subscribing to the cube's events
 * needs none of this: each subscriber gets its own callback and they do not
 * interfere. It is only the shared window that has to be shared carefully.
 */

export class SharedListener {
  private holders = 0;
  private off: (() => void) | null = null;

  /** `attach` installs the listener and returns the function that removes it. */
  constructor(private readonly attach: () => () => void) {}

  /** Is the listener installed right now? */
  get active(): boolean {
    return this.off !== null;
  }

  get count(): number {
    return this.holders;
  }

  /**
   * Ask for the listener. Call what comes back to stop asking.
   *
   * The returned function is safe to call twice: a React effect cleanup that
   * runs again must not drop the count below what is really held, or the
   * listener goes away while something still wants it.
   */
  hold(): () => void {
    this.holders++;
    if (!this.off) this.off = this.attach();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holders = Math.max(0, this.holders - 1);
      if (this.holders === 0) {
        this.off?.();
        this.off = null;
      }
    };
  }
}
