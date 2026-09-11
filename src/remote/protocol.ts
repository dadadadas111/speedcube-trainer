/**
 * The wire format between a phone holding the cube and a computer showing it.
 *
 * The phone has the bluetooth radio; the computer has the screen. The phone
 * forwards the cube's own events untouched and the computer feeds them into the
 * same code path a local cube uses, so every feature works without knowing
 * which side of the room the cube is in.
 *
 * The relay in the middle understands only `t` — it pairs two sockets by code
 * and copies `msg` payloads across without looking inside them.
 */

/** Ambiguous characters left out: no 0/O, no 1/I/L. */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 6;

export function isValidCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
}

/**
 * Accepts what someone actually types: lower case, spaces, dashes.
 *
 * No attempt is made to fix a misread character. The alphabet already leaves
 * out every pair that gets confused, so an O or a 1 in the input means the code
 * was read wrong, and guessing which character was meant would pair the wrong
 * two devices rather than saying so.
 */
export function normalizeCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return isValidCode(cleaned) ? cleaned : null;
}

/* ---------------- relay envelope ---------------- */

export type ToRelay =
  | { t: 'host' }
  | { t: 'join'; code: string }
  | { t: 'msg'; data: unknown };

export type FromRelay =
  | { t: 'code'; code: string }
  | { t: 'joined'; code: string }
  | { t: 'peer'; up: boolean }
  | { t: 'msg'; data: unknown }
  | { t: 'error'; reason: string };

/* ---------------- what the two sides say ---------------- */

export interface BridgeInfo {
  name: string;
  mac: string;
  hardware?: string;
  software?: string;
  gyro?: boolean;
  battery?: number;
}

export type BridgeMessage =
  /** The phone's cube connected, changed, or went away */
  | { k: 'info'; connected: boolean; info: BridgeInfo | null }
  /** A cube event, exactly as the cube reported it */
  | { k: 'event'; e: unknown }
  /** The computer asking the phone to send the cube a command */
  | { k: 'command'; type: string };
