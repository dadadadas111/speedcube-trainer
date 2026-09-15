/**
 * The app's side of the overlay link: host a room, push the state.
 *
 * Its own RelayLink rather than the shared one, so streaming and bridging a
 * phone can happen at the same time — which they will, since the phone is
 * often the thing holding the cube while the laptop is the thing being
 * streamed.
 *
 * Nothing here knows what the overlay looks like. It publishes a state and
 * forgets about it.
 */

import { RelayLink } from '../remote/relay';
import { useSyncExternalStore } from 'react';
import { EMPTY_STATE, encodeState, type StreamState } from './protocol';
import type { RelayStatus } from '../remote/relay';

let link: RelayLink | null = null;
let seq = 0;
let latest: StreamState = { ...EMPTY_STATE };
let status: RelayStatus = 'idle';
let code: string | null = null;
let peer = false;
const subscribers = new Set<() => void>();

const changed = () => {
  for (const s of [...subscribers]) s();
};

export interface StreamStatus {
  on: boolean;
  status: RelayStatus;
  code: string | null;
  /** True once an overlay has actually joined */
  peer: boolean;
}

let snapshot: StreamStatus = { on: false, status: 'idle', code: null, peer: false };
const rebuild = () => {
  snapshot = { on: !!link, status, code, peer };
  changed();
};

/** Open a room and start publishing. Idempotent. */
export function startStream(): void {
  if (link) return;
  const l = new RelayLink();
  link = l;
  l.on({
    status: (s, c) => {
      status = s;
      code = c;
      if (s !== 'linked') peer = false;
      rebuild();
      // A fresh overlay knows nothing, so resend the moment one turns up
      if (s === 'linked') {
        peer = true;
        rebuild();
        l.post({ kind: 'stream', state: encodeState(latest) } as never);
      }
    },
  });
  l.host('stream');
  rebuild();
}

export function stopStream(): void {
  link?.stop();
  link = null;
  status = 'idle';
  code = null;
  peer = false;
  rebuild();
}

/**
 * Publish. Only the fields that changed need passing; the rest carry over.
 *
 * Carrying over matters: the timer page knows the phase and the clock, and the
 * solve list knows the averages, and neither should have to know the other's
 * business to avoid blanking it.
 */
export function publish(patch: Partial<StreamState>): void {
  latest = { ...latest, ...patch, seq: ++seq };
  if (!link || status !== 'linked') return;
  link.post({ kind: 'stream', state: encodeState(latest) } as never);
}

export const streamState = (): StreamState => latest;

export function useStreamStatus(): StreamStatus {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => snapshot,
    () => snapshot,
  );
}

/** The address to paste into OBS as a Browser Source. */
export function overlayUrl(streamCode: string): string {
  if (typeof location === 'undefined') return `/?overlay=${streamCode}`;
  return `${location.origin}${location.pathname}?overlay=${streamCode}`;
}
