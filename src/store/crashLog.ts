/**
 * Crashes, kept across the reload that follows them.
 *
 * The connection log lives in memory, which is fine for a cube that keeps
 * talking and useless for a crash: the page comes back empty and the one thing
 * worth reading is gone. A bug nobody can reproduce on demand — "it crashed
 * somewhere in training, I don't remember what I was doing" — is only ever
 * solved by the record that survived, so these go to localStorage.
 *
 * Five is plenty. What matters is the most recent one and whether it keeps
 * happening in the same place, and an unbounded list in localStorage is its own
 * small bug.
 */

const KEY = 'sct.crashes';
const KEEP = 5;

export interface CrashRecord {
  /** When, in ms since the epoch */
  t: number;
  message: string;
  /** Where in the app it happened, as far as the page knows */
  where: string;
  stack: string;
}

/** Read the saved crashes, newest first. Never throws. */
export function recentCrashes(): CrashRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCrash).slice(0, KEEP);
  } catch {
    return [];
  }
}

function isCrash(x: unknown): x is CrashRecord {
  const c = x as CrashRecord | null;
  return !!c && typeof c.t === 'number' && typeof c.message === 'string';
}

/**
 * Write one down.
 *
 * Everything here runs while the app is already broken, so nothing in it may
 * throw: storage can be full, disabled, or absent, and a crash logger that
 * crashes is worse than none.
 */
export function recordCrash(message: string, where: string, stack: string): void {
  try {
    const rec: CrashRecord = {
      t: Date.now(),
      message: String(message).slice(0, 500),
      where: String(where).slice(0, 200),
      stack: String(stack).slice(0, 4000),
    };
    localStorage.setItem(KEY, JSON.stringify([rec, ...recentCrashes()].slice(0, KEEP)));
  } catch {
    // Nothing sensible to do, and complaining would take the page down twice
  }
}

export function clearCrashes(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* see above */
  }
}

/** One crash as a line of text, for copying into a message. */
export function formatCrash(c: CrashRecord): string {
  const when = new Date(c.t).toISOString();
  return `${when}  ${c.where}\n${c.message}\n${c.stack}`;
}
