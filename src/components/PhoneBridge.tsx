/**
 * Pairing a phone that has bluetooth with a computer that has a screen.
 *
 * The computer asks for a code; the phone types it in and then connects to the
 * cube as it normally would. From there the phone forwards everything the cube
 * says, so the computer behaves exactly as if the cube were plugged into it.
 */

import { useState } from 'react';
import { useApp } from '../store/app';
import { cubeLink } from '../smartcube/connection';
import { CODE_LENGTH, normalizeCode } from '../remote/protocol';
import { bridgeToCode, hostPhone, stopRemote, useRelayStatus, useRemoteRole } from '../remote/session';

export default function PhoneBridge() {
  const role = useRemoteRole();
  const { cubeInfo } = useApp();
  const { status, code, error } = useRelayStatus();
  const [typed, setTyped] = useState('');

  if (role === null) {
    return (
      <div className="flex flex-col gap-3">
        <p className="max-w-[52ch] text-[13px] text-ink-400">
          No bluetooth on this machine? Let a phone hold the cube and send what it sees over here.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary !py-1 !text-[13px]" onClick={() => hostPhone()}>
            Show a code for my phone
          </button>
          <button className="btn !py-1 !text-[13px]" onClick={() => setTyped(' ')}>
            This phone has the cube
          </button>
        </div>
        {typed !== '' && <CodeEntry value={typed.trim()} onChange={setTyped} />}
      </div>
    );
  }

  if (role === 'host') {
    return (
      <div className="flex flex-col gap-3">
        {status === 'linked' ? (
          <div>
            <p className="text-sm font-semibold text-good">Phone connected</p>
            <p className="mt-0.5 text-[13px] text-ink-400">
              {cubeInfo ? `${cubeInfo.name} · battery ${cubeInfo.battery ?? '?'}%` : 'Waiting for the cube…'}
            </p>
          </div>
        ) : status === 'error' ? (
          <p className="text-sm text-bad">{error ?? 'The relay could not be reached'}</p>
        ) : code ? (
          <div>
            <p className="text-[13px] text-ink-400">Open this site on your phone and enter</p>
            <p className="tnum mt-1 font-mono text-4xl font-semibold tracking-[0.2em] text-cube-blue">{code}</p>
            <p className="mt-1.5 text-[13px] text-ink-500">Waiting for the phone…</p>
          </div>
        ) : (
          <p className="text-sm text-ink-400">Asking the relay for a code…</p>
        )}
        <button className="btn !py-1 !text-[13px] self-start" onClick={() => stopRemote()}>
          Stop
        </button>
      </div>
    );
  }

  return <BridgeStatus />;
}

function CodeEntry({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ready = normalizeCode(value) !== null;
  return (
    <div className="flex flex-col gap-2">
      <label className="field-label" htmlFor="bridge-code">
        Code from the computer
      </label>
      <div className="flex gap-2">
        <input
          id="bridge-code"
          className="input max-w-[10rem] font-mono text-lg uppercase tracking-[0.2em]"
          value={value}
          maxLength={CODE_LENGTH + 2}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && ready) bridgeToCode(normalizeCode(value)!);
          }}
        />
        <button
          className="btn btn-primary !text-[13px]"
          disabled={!ready}
          onClick={() => bridgeToCode(normalizeCode(value)!)}
        >
          Link
        </button>
      </div>
    </div>
  );
}

/** What the phone shows while it is doing the bridging. */
function BridgeStatus() {
  const { status, error } = useRelayStatus();
  const canBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  const { cubeStatus, cubeInfo } = useApp();
  const connected = cubeStatus === 'connected';
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold">
          {status === 'linked' ? (
            <span className="text-good">Sending to your computer</span>
          ) : status === 'error' ? (
            <span className="text-bad">{error ?? 'Lost the relay'}</span>
          ) : (
            <span className="text-warn">Connecting…</span>
          )}
        </p>
        <p className="mt-0.5 text-[13px] text-ink-400">
          {connected ? `${cubeInfo?.name ?? 'Cube'} · battery ${cubeInfo?.battery ?? '?'}%` : 'No cube yet'}
        </p>
      </div>
      {!connected &&
        (canBluetooth ? (
          <button className="btn btn-primary !py-1 !text-[13px] self-start" onClick={() => void cubeLink.connect()}>
            Connect the cube
          </button>
        ) : (
          <p className="max-w-[46ch] text-[13px] text-warn">
            This browser has no Web Bluetooth, so it cannot hold the cube. Use Chrome on Android.
          </p>
        ))}
      <p className="max-w-[46ch] text-[12px] text-ink-500">
        Leave this page open. The screen is kept awake while bridging.
      </p>
      <button className="btn !py-1 !text-[13px] self-start" onClick={() => stopRemote()}>
        Stop bridging
      </button>
    </div>
  );
}
