import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store/app';
import { cubeLink } from '../smartcube/connection';
import MacPrompt from './MacPrompt';
import CubeSync from './CubeSync';
import PhoneBridge from './PhoneBridge';
import { useRemoteRole } from '../remote/session';

/**
 * Dropdown geometry. On a phone the panel spans the screen with a margin rather
 * than hanging off the button — anchored to a button near the right edge, a
 * panel this wide ends up half off the screen.
 */
const PANEL =
  'panel fixed inset-x-2 top-16 z-50 p-4 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[26rem]';

export default function CubeStatus() {
  const { cubeStatus, cubeInfo, settings } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [garbled, setGarbled] = useState(false);
  const [macAsk, setMacAsk] = useState<{ deviceName: string; resolve: (mac: string | null) => void } | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const remoteRole = useRemoteRole();
  const asked = useRef(false);

  // The library calls this when it cannot read the MAC itself. It returns a
  // promise that waits for the dialog, instead of a bare window.prompt.
  useEffect(() => {
    cubeLink.askForMac = (deviceName) =>
      new Promise<string | null>((resolve) => {
        asked.current = true;
        setMacAsk({ deviceName, resolve });
      });
    return () => {
      cubeLink.askForMac = null;
    };
  }, []);

  // Garbled data almost certainly means a wrong MAC — say so, rather than
  // leaving the user to wonder why the on-screen cube is nonsense.
  useEffect(() => cubeLink.on({ garbled: () => setGarbled(true) }), []);

  // The four-D gesture happens with the cube in your hands and your eyes on it,
  // so say plainly that it landed — otherwise there is no way to tell.
  const [gestured, setGestured] = useState(false);
  useEffect(
    () =>
      cubeLink.on({
        resetGesture: () => {
          setGestured(true);
          window.setTimeout(() => setGestured(false), 2200);
        },
      }),
    [],
  );

  const connect = async () => {
    setError(null);
    setGarbled(false);
    try {
      await cubeLink.connect();
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      if (/cancel|User cancelled/i.test(msg)) return;
      setError(
        /MAC address/i.test(msg)
          ? 'Without a MAC address the cube data cannot be decrypted.'
          : msg,
      );
    }
  };

  // The link dropped on its own. Say so where the connect button is, because
  // "connect the cube" reads like it was never connected, and it was.
  const dropped = cubeStatus === 'disconnected' && cubeLink.droppedUnexpectedly;

  const dot =
    cubeStatus === 'connected'
      ? 'var(--color-good)'
      : cubeStatus === 'connecting'
        ? 'var(--color-warn)'
        : dropped
          ? 'var(--color-bad)'
          : 'var(--color-ink-500)';

  return (
    <div className="flex flex-wrap items-center gap-3">
      {settings.keyboardCube && (
        <span className="rounded-full border border-ink-600 px-2 py-0.5 text-[12px] text-ink-300">virtual cube</span>
      )}
      {cubeStatus === 'connected' ? (
        <>
          <span className="flex items-center gap-1.5 text-[13px] text-ink-300">
            <span className="size-2 rounded-full" style={{ background: dot }} />
            {cubeInfo?.name ?? 'Cube'}
            {cubeInfo?.battery != null && <span className="tnum text-ink-400">{cubeInfo.battery}%</span>}
          </span>
          <div className="relative">
            <button
              className="btn btn-ghost !px-2 !py-1 !text-[13px]"
              onClick={() => setSyncOpen((v) => !v)}
              aria-expanded={syncOpen}
              title="App showing something different from your cube?"
            >
              Sync
            </button>
            {syncOpen && (
              // Living in the top bar means it is reachable from anywhere in the
              // app, not only from the timer page.
              <div className={PANEL}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold">Sync with the real cube</h3>
                  <button className="btn btn-ghost !px-1.5 !py-0 !text-[13px]" onClick={() => setSyncOpen(false)}>
                    Close
                  </button>
                </div>
                <CubeSync />
              </div>
            )}
          </div>
          <button className="btn btn-ghost !px-2 !py-1 !text-[13px]" onClick={() => void cubeLink.disconnect()}>
            Disconnect
          </button>
        </>
      ) : (
        <button className="btn !py-1 !text-[13px]" onClick={() => void connect()} disabled={cubeStatus === 'connecting'}>
          <span className="size-2 rounded-full" style={{ background: dot }} />
          {cubeStatus === 'connecting' ? 'Connecting…' : dropped ? 'Cube dropped — reconnect' : 'Connect smart cube'}
        </button>
      )}

      {/* A phone with bluetooth can hold the cube for a machine without it */}
      <div className="relative">
        <button
          className={`btn btn-ghost !px-2 !py-1 !text-[13px] ${remoteRole ? '!text-cube-blue' : ''}`}
          onClick={() => setBridgeOpen((v) => !v)}
          aria-expanded={bridgeOpen}
        >
          {remoteRole === 'bridge' ? 'Bridging' : remoteRole === 'host' ? 'Phone' : 'Use a phone'}
        </button>
        {bridgeOpen && (
          <div className={PANEL}>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">Phone as the cube's radio</h3>
              <button className="btn btn-ghost !px-1.5 !py-0 !text-[13px]" onClick={() => setBridgeOpen(false)}>
                Close
              </button>
            </div>
            <PhoneBridge />
          </div>
        )}
      </div>

      {gestured && (
        <span className="pop-in rounded-full border border-good px-2 py-0.5 text-[12px] text-good">
          Synced — cube taken as solved
        </span>
      )}

      {garbled && (
        <span className="max-w-[34ch] text-[12px] text-bad">
          The data read back is garbage — the MAC is wrong. Delete the saved MAC in Settings and reconnect.
        </span>
      )}
      {error && <span className="max-w-[30ch] text-[12px] text-bad">{error}</span>}

      {macAsk && (
        <MacPrompt
          deviceName={macAsk.deviceName}
          onSubmit={(mac) => {
            macAsk.resolve(mac);
            setMacAsk(null);
          }}
          onCancel={() => {
            macAsk.resolve(null);
            setMacAsk(null);
          }}
        />
      )}
    </div>
  );
}
