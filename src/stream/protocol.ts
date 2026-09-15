/**
 * What an overlay needs to know, and nothing else.
 *
 * OBS loads a Browser Source, which is its own browser: it cannot see this
 * app's storage, its memory, or anything else about it. So the state goes over
 * the same relay the phone bridge uses — one side hosts a room, the other joins
 * with the code, and the relay copies messages across without looking inside.
 *
 * The running clock is deliberately NOT streamed frame by frame. Sixty messages
 * a second to draw a number that any browser can count on its own is waste, and
 * it would still stutter with the network. Instead the start is announced once
 * with how long has already passed, and the overlay runs its own clock from
 * there — which also sidesteps the two machines disagreeing about the time,
 * since nothing absolute is ever sent.
 */

export type StreamPhase = 'idle' | 'scrambling' | 'ready' | 'inspecting' | 'running' | 'done';

export interface StreamStep {
  key: string;
  label: string;
  durationMs: number;
  /** The pause before this step's first turn, part of durationMs */
  leadMs: number;
}

export interface StreamState {
  /** Bumped on every send, so a stale message arriving late is ignored */
  seq: number;
  phase: StreamPhase;
  session: string;
  /** The scramble, while it is still worth showing */
  scramble: string | null;
  /**
   * How much of the solve had already passed when this was sent.
   *
   * The overlay adds its own elapsed time to this, so the clock is smooth and
   * needs no agreement about what time it is.
   */
  elapsedMs: number;
  /** Seconds left of inspection, when inspecting */
  inspectLeftMs: number;
  /** The finished time, once there is one */
  finalMs: number | null;
  penalty: 'none' | '+2' | 'DNF';
  /** Step splits of the solve just finished */
  steps: StreamStep[];
  count: number;
  ao5: number;
  ao12: number;
  best: number;
  /** The point of the stream: how many solves are under the target */
  goalMs: number;
  goalHits: number;
}

export const EMPTY_STATE: StreamState = {
  seq: 0,
  phase: 'idle',
  session: '',
  scramble: null,
  elapsedMs: 0,
  inspectLeftMs: 0,
  finalMs: null,
  penalty: 'none',
  steps: [],
  count: 0,
  ao5: NaN,
  ao12: NaN,
  best: NaN,
  goalMs: 10_000,
  goalHits: 0,
};

/** The envelope, so a stream message is never mistaken for a cube event. */
export interface StreamMessage {
  kind: 'stream';
  state: StreamState;
}

export const isStreamMessage = (m: unknown): m is StreamMessage => {
  const x = m as StreamMessage | null;
  return !!x && x.kind === 'stream' && !!x.state && typeof x.state.seq === 'number';
};

/**
 * Should this message replace what the overlay is showing?
 *
 * The relay does not reorder, but a reconnect can replay and a slow send can
 * arrive after a newer one. A sequence number is one integer and settles it.
 */
export const isNewer = (incoming: StreamState, current: StreamState): boolean =>
  incoming.seq > current.seq;

/**
 * JSON cannot carry NaN, so the averages travel as null and come back as NaN.
 *
 * Without this an empty session arrives as `null` and every average on the
 * overlay reads "null" — which is worse than blank, because it looks broken
 * rather than empty.
 */
export function encodeState(s: StreamState): unknown {
  const num = (x: number) => (Number.isFinite(x) ? x : null);
  return { ...s, ao5: num(s.ao5), ao12: num(s.ao12), best: num(s.best) };
}

export function decodeState(raw: unknown): StreamState | null {
  const x = raw as Record<string, unknown> | null;
  if (!x || typeof x.seq !== 'number') return null;
  const num = (v: unknown) => (typeof v === 'number' ? v : NaN);
  return {
    ...EMPTY_STATE,
    ...(x as unknown as StreamState),
    ao5: num(x.ao5),
    ao12: num(x.ao12),
    best: num(x.best),
  };
}
