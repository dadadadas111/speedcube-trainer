/**
 * What went wrong, said in words worth reading.
 *
 * Web Bluetooth reports failures as `NetworkError: Connection Error` and
 * `NotFoundError: User cancelled the requestDevice() chooser`, which tell the
 * person holding the cube nothing at all. Nearly every failure here has one of
 * a handful of mundane causes, and naming the cause is the difference between
 * "it is broken" and "give the cube a turn and press connect again".
 *
 * Kept apart from the connection so it can be tested without a browser.
 */

export type ConnectFailure =
  /** The chooser was dismissed. Not an error; say nothing. */
  | 'cancelled'
  /** The cube was picked but never answered — asleep, or out of range. */
  | 'asleep'
  /** The link came up and then went straight back down. */
  | 'dropped'
  /** No MAC address, so nothing can be decrypted. */
  | 'no-mac'
  /** Something else is already holding the cube: another tab, or the OS. */
  | 'busy'
  /** Not a cube this library speaks to. */
  | 'unsupported'
  | 'unknown';

export interface FailureReading {
  kind: ConnectFailure;
  /** What to put in front of the user; empty when there is nothing to say */
  message: string;
  /** Whether pressing connect again is worth doing */
  retryable: boolean;
}

const READINGS: Record<ConnectFailure, Omit<FailureReading, 'kind'>> = {
  cancelled: { message: '', retryable: true },
  asleep: {
    message: 'The cube did not answer. Give it a turn to wake it up, then connect again.',
    retryable: true,
  },
  dropped: {
    message: 'The cube connected and then dropped. Give it a turn and connect again.',
    retryable: true,
  },
  'no-mac': {
    message: 'Without a MAC address the cube data cannot be decrypted.',
    retryable: false,
  },
  busy: {
    message: 'Another tab or app is holding the cube. Close it, or turn Bluetooth off and on.',
    retryable: true,
  },
  unsupported: {
    message: 'That device is not a smart cube this app can read.',
    retryable: false,
  },
  unknown: { message: '', retryable: true },
};

/**
 * Read a thrown error.
 *
 * Matching on message text is unlovely, but the DOMException names Chrome uses
 * are too coarse to separate "asleep" from "in use" and the message is the only
 * place that distinction survives.
 */
export function readConnectFailure(err: unknown): FailureReading {
  const e = err as { name?: string; message?: string } | null;
  const name = e?.name ?? '';
  const msg = e?.message ?? String(err ?? '');
  const kind = classify(name, msg);
  // Only an unrecognised failure falls back to quoting the browser. A dismissed
  // chooser is meant to say nothing at all, and would otherwise say "cancelled".
  const known = READINGS[kind];
  return { kind, ...known, message: kind === 'unknown' ? msg : known.message };
}

function classify(name: string, msg: string): ConnectFailure {
  if (name === 'NotFoundError' && /cancel/i.test(msg)) return 'cancelled';
  if (/cancel/i.test(msg)) return 'cancelled';
  if (/MAC address/i.test(msg)) return 'no-mac';
  if (/already in progress|in use|GATT operation already/i.test(msg)) return 'busy';
  if (/wrong or unsupported cube|find target BLE services/i.test(msg)) return 'unsupported';
  if (/disconnected|Device is not connected|GATT Server is disconnected/i.test(msg)) return 'dropped';
  if (name === 'NetworkError' || /Connection Error|connect.*fail|unreachable/i.test(msg)) return 'asleep';
  if (name === 'NotSupportedError') return 'unsupported';
  return 'unknown';
}

/** Was the chooser simply dismissed? Nothing needs saying in that case. */
export const wasCancelled = (err: unknown) => readConnectFailure(err).kind === 'cancelled';
