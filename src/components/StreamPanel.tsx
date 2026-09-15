/**
 * Getting the session onto a stream.
 *
 * OBS takes a Browser Source — one address to paste — and that browser is its
 * own, with no sight of this app's storage or memory. So the state goes over
 * the same relay the phone bridge uses: this side hosts a room, the overlay
 * joins with the code in its address, and the relay copies messages across.
 *
 * Its own connection, not the bridge's, so a phone can be holding the cube
 * while the laptop is the thing being streamed — which is the normal way round
 * for anyone with one good camera.
 */

import { useState } from 'react';
import { useApp } from '../store/app';
import { overlayUrl, startStream, stopStream, useStreamStatus } from '../stream/host';
import { formatTime } from '../analysis/stats';

const SIZES = [
  { label: 'small', scale: 16 },
  { label: 'medium', scale: 22 },
  { label: 'large', scale: 30 },
];

export default function StreamPanel() {
  const { settings, updateSettings } = useApp();
  const stream = useStreamStatus();
  const [scale, setScale] = useState(22);
  const [copied, setCopied] = useState(false);

  const url = stream.code ? `${overlayUrl(stream.code)}&scale=${scale}` : '';

  return (
    <section className="panel p-5">
      <h2 className="text-base font-semibold">Stream overlay</h2>
      <p className="mt-1 max-w-[65ch] text-[13px] text-ink-400">
        The clock, your averages and the step splits of the last solve, drawn on a transparent background for OBS.
        Start it here, then paste the address into a Browser Source.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!stream.on ? (
          <button className="btn btn-primary !py-1 !text-[13px]" onClick={startStream}>
            Start the overlay
          </button>
        ) : (
          <button className="btn !py-1 !text-[13px]" onClick={stopStream}>
            Stop
          </button>
        )}

        <div className="flex overflow-hidden rounded-md border border-ink-700">
          {SIZES.map((s) => (
            <button
              key={s.label}
              className={`px-2 py-0.5 text-[12px] transition-colors ${
                scale === s.scale ? 'bg-ink-700 text-ink-100' : 'text-ink-500'
              }`}
              onClick={() => setScale(s.scale)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-[13px] text-ink-400">
          Sub
          <input
            className="input !w-16 !py-0.5 !text-[13px]"
            type="number"
            min={1}
            max={120}
            value={Math.round(settings.targetMs / 1000)}
            onChange={(e) => void updateSettings({ targetMs: Math.max(1, Number(e.target.value)) * 1000 })}
          />
        </label>
      </div>

      {stream.on && (
        <div className="mt-3">
          {stream.status === 'connecting' && <p className="text-[13px] text-ink-400">Opening a room…</p>}
          {stream.status === 'error' && (
            <p className="text-[13px] text-bad">The relay is not answering. Stop and start it again.</p>
          )}
          {url && (
            <>
              <p className="text-[12px] text-ink-500">
                In OBS: <span className="text-ink-300">+ → Browser</span>, paste this as the URL, and tick{' '}
                <span className="text-ink-300">Shutdown source when not visible</span> off so it stays connected.
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border border-ink-700 bg-ink-900 px-2 py-1 font-mono text-[12px] text-ink-200">
                  {url}
                </code>
                <button
                  className="btn !py-1 !text-[12px]"
                  onClick={() => {
                    void navigator.clipboard?.writeText(url);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1800);
                  }}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="mt-2 text-[13px]">
                {stream.peer ? (
                  <span className="text-good">The overlay is connected.</span>
                ) : (
                  <span className="text-warn">Waiting for OBS to load it…</span>
                )}
              </p>
            </>
          )}
        </div>
      )}

      <p className="mt-3 max-w-[65ch] text-[12px] text-ink-500">
        Anyone with the address can watch the numbers, so treat it as you would the code for the phone bridge: good
        for one sitting. Stopping the overlay retires it. The target above is what the overlay counts — set it to 10
        and it keeps a tally of your sub-10 solves, which saves the chat asking.{' '}
        {!Number.isNaN(settings.targetMs) && (
          <span className="text-ink-400">Currently sub {formatTime(settings.targetMs)}.</span>
        )}
      </p>
    </section>
  );
}
