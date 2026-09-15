/**
 * Building the overlay: pick a block, size it, look at it, copy the address.
 *
 * One Browser Source per block, because OBS already has the drag handles, the
 * snapping and the scene switching, and does them better than anything built
 * here would. An editor that laid the blocks out itself would be a worse OBS
 * inside a worse window; this one chooses what each block SHOWS and hands over
 * an address, and where it goes stays OBS's business.
 *
 * The preview renders the real block with an invented session, so it cannot
 * drift from what OBS will show, and it is worth looking at before a single
 * solve has been done.
 */

import { useState } from 'react';
import { useApp } from '../store/app';
import { overlayUrl, startStream, stopStream, useStreamStatus } from '../stream/host';
import { SAMPLE, WIDGETS, type WidgetId } from '../stream/widgets';
import { formatTime } from '../analysis/stats';

const SIZES = [
  { label: 'S', scale: 16 },
  { label: 'M', scale: 22 },
  { label: 'L', scale: 30 },
  { label: 'XL', scale: 42 },
];

export default function StreamPanel() {
  const { settings, updateSettings } = useApp();
  const stream = useStreamStatus();
  const [picked, setPicked] = useState<WidgetId>('clock');
  const [scale, setScale] = useState<number | null>(null);
  const [backdrop, setBackdrop] = useState(true);
  const [rows, setRows] = useState(5);
  const [copied, setCopied] = useState<string | null>(null);

  const block = WIDGETS.find((w) => w.id === picked)!;
  const size = scale ?? block.scale;

  const url = stream.code
    ? `${overlayUrl(stream.code)}&w=${block.id}&scale=${size}${backdrop ? '' : '&bg=0'}${
        block.rows ? `&n=${rows}` : ''
      }`
    : '';

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(text);
    window.setTimeout(() => setCopied(null), 1800);
  };

  return (
    <section className="panel p-5">
      <h2 className="text-base font-semibold">Stream overlay</h2>
      <p className="mt-1 max-w-[65ch] text-[13px] text-ink-400">
        One Browser Source per block, positioned in OBS where you already do that sort of thing. Pick a block, size
        it, and copy its address.
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
        <label className="flex items-center gap-1.5 text-[13px] text-ink-400">
          Target: sub
          <input
            className="input !w-16 !py-0.5 !text-[13px]"
            type="number"
            min={1}
            max={120}
            value={Math.round(settings.targetMs / 1000)}
            onChange={(e) => void updateSettings({ targetMs: Math.max(1, Number(e.target.value)) * 1000 })}
          />
        </label>
        {stream.on && (
          <span className="text-[12px]">
            {stream.status === 'connecting' && <span className="text-ink-400">opening a room…</span>}
            {stream.status === 'error' && <span className="text-bad">the relay is not answering</span>}
            {stream.code && (stream.peer ? <span className="text-good">connected</span> : <span className="text-warn">no source yet</span>)}
          </span>
        )}
      </div>

      {/* Which block */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {WIDGETS.map((w) => (
          <button
            key={w.id}
            onClick={() => {
              setPicked(w.id);
              setScale(null);
            }}
            title={w.what}
            className={
              'rounded-full border px-2.5 py-1 text-[13px] transition-colors ' +
              (picked === w.id
                ? 'border-cube-blue bg-[color-mix(in_srgb,var(--color-cube-blue)_18%,transparent)] text-ink-100'
                : 'border-ink-600 text-ink-300 hover:bg-ink-800')
            }
          >
            {w.name}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[12px] text-ink-500">{block.what}</p>

      {/* How it looks */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-md border border-ink-700">
          {SIZES.map((s) => (
            <button
              key={s.label}
              className={`px-2.5 py-0.5 text-[12px] transition-colors ${
                size === s.scale ? 'bg-ink-700 text-ink-100' : 'text-ink-500'
              }`}
              onClick={() => setScale(s.scale)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[13px] text-ink-400">
          <input type="checkbox" checked={backdrop} onChange={(e) => setBackdrop(e.target.checked)} />
          Dark panel behind
        </label>
        {block.rows && (
          <label className="flex items-center gap-1.5 text-[13px] text-ink-400">
            Rows
            <input
              className="input !w-14 !py-0.5 !text-[13px]"
              type="number"
              min={1}
              max={12}
              value={rows}
              onChange={(e) => setRows(Math.min(12, Math.max(1, Number(e.target.value))))}
            />
          </label>
        )}
      </div>

      {/* The preview: the real block, with a session invented for it */}
      <div className="mt-3">
        <p className="mb-1.5 text-[12px] text-ink-500">
          Preview — the same code OBS runs, on an invented session
        </p>
        <div
          className="flex items-start overflow-auto rounded-lg p-3"
          style={{
            // Checks behind it, so a transparent block is visibly transparent
            backgroundImage:
              'linear-gradient(45deg,#1b2430 25%,transparent 25%),linear-gradient(-45deg,#1b2430 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1b2430 75%),linear-gradient(-45deg,transparent 75%,#1b2430 75%)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0,0 8px,8px -8px,-8px 0px',
            backgroundColor: '#0e141c',
          }}
        >
          <div
            style={{
              fontSize: `${size}px`,
              background: backdrop ? 'rgba(10,14,20,0.62)' : 'transparent',
              borderRadius: backdrop ? '0.5em' : 0,
            }}
            className="pointer-events-none inline-flex select-none flex-col gap-[0.4em] p-[0.7em] font-sans"
          >
            {block.render({ state: SAMPLE, shownMs: 8_120, rows })}
          </div>
        </div>
      </div>

      {/* The address */}
      {url ? (
        <div className="mt-3">
          <p className="text-[12px] text-ink-500">
            In OBS: <span className="text-ink-300">+ → Browser</span>, paste this, and leave{' '}
            <span className="text-ink-300">Shutdown source when not visible</span> unticked so it stays connected.
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-ink-700 bg-ink-900 px-2 py-1 font-mono text-[12px] text-ink-200">
              {url}
            </code>
            <button className="btn !py-1 !text-[12px]" onClick={() => copy(url)}>
              {copied === url ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-ink-500">
          Start the overlay to get an address. The preview above works either way.
        </p>
      )}

      <p className="mt-3 max-w-[65ch] text-[12px] text-ink-500">
        Every block shares one room, so start it once and add as many sources as you like. Anyone with an address
        can watch the numbers — treat it as you would the phone bridge code, good for one sitting; Stop retires it.
        The target counts solves under {formatTime(settings.targetMs)}, which is what the sub-X block shows.
      </p>
    </section>
  );
}
