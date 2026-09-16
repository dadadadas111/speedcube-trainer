/**
 * When to ask the cube what it is actually showing.
 *
 * The app keeps its own copy of the cube by applying every turn it is told
 * about. Bluetooth is not lossless and the library holds moves back when a
 * serial goes missing, so that copy drifts — and once it has drifted it stays
 * wrong, because nothing about applying more turns ever puts it right.
 *
 * The cube itself has the answer. Every facelets packet is the whole position,
 * straight from the cube, and accepting one makes the copy correct no matter
 * how far it had wandered. So the model cannot be GUARANTEED right between
 * questions — no radio link can promise that — but it can be guaranteed to
 * come back, as long as something keeps asking.
 *
 * The timer used to be the only thing that asked, and only while a solve was
 * running. That left every other moment — scrambling, drilling, following a
 * pro solve, the cube sitting on the desk — with no way back from a dropped
 * move except a solve or a button. This decides when to ask everywhere else.
 *
 * Kept apart from the connection so it can be tested without a cube.
 */

export interface HealInput {
  now: number;
  /** When the last turn arrived */
  lastMoveAt: number;
  /** When anything was last asked of the cube, by anyone */
  lastCommandAt: number;
  /** The cube's own counter is ahead of us: turns are stuck in the buffer */
  behind: boolean;
}

/** Hands have to stop first: a question mid-turn is a write mid-solve. */
export const STILL_MS = 900;
/**
 * Unless the cube is telling us it has turns we never got. Then the question
 * is not a nicety — a facelets packet is what makes the library go and fetch
 * them, so asking sooner is what unsticks the buffer.
 */
export const BEHIND_STILL_MS = 350;
/**
 * And never on top of somebody else's question.
 *
 * The timer has its own faster budget for the end of a solve. Both writing at
 * once is how a link gets dropped, so this one always gives way — the shared
 * timestamp means the two can never add up to more traffic than the slower of
 * them allows.
 */
export const QUIET_MS = 1500;

export function shouldAsk({ now, lastMoveAt, lastCommandAt, behind }: HealInput): boolean {
  if (now - lastCommandAt < QUIET_MS) return false;
  return now - lastMoveAt >= (behind ? BEHIND_STILL_MS : STILL_MS);
}
