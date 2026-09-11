/**
 * Which half of the bridge this browser is, and keeping React told about it.
 *
 * Deliberately module level rather than component state: the link has to
 * survive moving between pages, and there can only ever be one of it.
 */

import { useSyncExternalStore } from 'react';
import { relay, type RelayStatus } from './relay';
import { startBridge, startHost } from './wiring';

export type RemoteRole = 'host' | 'bridge' | null;

let role: RemoteRole = null;
let teardown: (() => void) | null = null;
let wakeLock: { release(): Promise<void> } | null = null;
const subscribers = new Set<() => void>();

function changed() {
  for (const s of [...subscribers]) s();
}

/**
 * Keep a bridging phone's screen on. Browsers drop the lock whenever the tab is
 * hidden, so it has to be asked for again each time the phone comes back.
 */
async function holdScreenAwake() {
  try {
    const wl = (navigator as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (!wl) return;
    wakeLock = await wl.request('screen');
  } catch {
    /* not supported, or refused — the bridge still works */
  }
}

function releaseScreen() {
  void wakeLock?.release().catch(() => {});
  wakeLock = null;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (role === 'bridge' && document.visibilityState === 'visible' && !wakeLock) void holdScreenAwake();
  });
}

function begin(next: Exclude<RemoteRole, null>) {
  stopRemote();
  role = next;
  teardown = next === 'host' ? startHost() : startBridge();
  changed();
}

/** This machine has the screen: ask the relay for a code to read out. */
export function hostPhone() {
  begin('host');
  relay.host();
}

/** This machine has the cube: join the computer that is waiting. */
export function bridgeToCode(code: string) {
  begin('bridge');
  relay.join(code);
  void holdScreenAwake();
}

export function stopRemote() {
  teardown?.();
  teardown = null;
  role = null;
  releaseScreen();
  relay.stop();
  changed();
}

export function currentRole(): RemoteRole {
  return role;
}

export function useRemoteRole(): RemoteRole {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    currentRole,
    () => null,
  );
}

export interface RelaySnapshot {
  status: RelayStatus;
  code: string | null;
  error: string | null;
}

let snapshot: RelaySnapshot = { status: relay.status, code: relay.code, error: relay.error };
relay.on({
  status: (status, code, error) => {
    snapshot = { status, code, error };
    changed();
  },
});

export function useRelayStatus(): RelaySnapshot {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => snapshot,
    () => snapshot,
  );
}
