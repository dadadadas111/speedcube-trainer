/**
 * Comparing the cube's packet serial numbers.
 *
 * The cube numbers every state change, wrapping modulo 256. A state snapshot it
 * pushes periodically can ARRIVE AFTER newer moves while describing an OLDER
 * state — overwriting blindly drags the app's state backwards, which is why the
 * timer once failed to notice a finished solve.
 *
 * Kept out of the bluetooth module so the tests run outside a browser.
 */

/** Half the range: beyond this we treat it as having wrapped into the past. */
const HALF = 128;

/**
 * Is `candidate` as new as, or newer than, `last`?
 * A null `last` means there is no marker yet, so everything is accepted.
 */
export function isFreshSerial(candidate: number, last: number | null): boolean {
  if (last === null) return true;
  return (((candidate - last) % 256) + 256) % 256 <= HALF;
}
