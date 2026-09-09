/**
 * The dialog that asks for the cube's MAC address.
 *
 * The MAC is required, not optional: the library salts the decryption key with
 * it, and without it every packet read back is garbage. A browser can only read
 * the MAC by itself through watchAdvertisements(), which on Chrome for Android
 * sits behind an experimental flag — so on a phone you usually type it in once.
 */

import { useEffect, useState } from 'react';
import { normalizeMac } from '../smartcube/connection';

interface Props {
  deviceName: string;
  onSubmit: (mac: string) => void;
  onCancel: () => void;
}

export default function MacPrompt({ deviceName, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState('');
  const normalized = normalizeMac(value);
  const touched = value.trim().length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mac-title"
    >
      <div className="panel w-full max-w-[520px] p-5">
        <h2 id="mac-title" className="text-base font-semibold">
          Enter the cube's MAC address
        </h2>
        <p className="mt-1 text-[13px] text-ink-400">
          Cube: <span className="font-mono text-ink-200">{deviceName}</span>
        </p>

        <p className="mt-3 max-w-[60ch] text-sm text-ink-300">
          GAN encrypts its data with a key salted from the MAC address, so without it nothing can be read.
          Phone browsers usually cannot read the MAC automatically, so type it once — the app remembers it.
        </p>

        <label className="field-label mt-4" htmlFor="mac-input">
          MAC address
        </label>
        <input
          id="mac-input"
          autoFocus
          className="input font-mono"
          placeholder="AB:CD:EF:12:34:56"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && normalized) onSubmit(normalized);
          }}
        />
        {touched &&
          (normalized ? (
            <p className="mt-1.5 text-[13px] text-good">Read as {normalized}</p>
          ) : (
            <p className="mt-1.5 text-[13px] text-bad">Needs exactly 6 hex bytes, e.g. AB:CD:EF:12:34:56 or abcdef123456.</p>
          ))}

        <details className="mt-4 rounded-lg border border-ink-700 bg-ink-900 p-3">
          <summary className="cursor-pointer text-sm text-ink-200">Where do I find the MAC?</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[13px] text-ink-300">
            <li>
              Use a Bluetooth scanner such as <span className="text-ink-100">nRF Connect</span> (Android): scan and
              the cube's name shows up with its MAC address beside it. This is the surest way.
            </li>
            <li>
              Or open GAN's own app and look at the connected device's information.
            </li>
            <li>
              To skip typing it: open <span className="font-mono text-ink-100">chrome://flags</span>, enable{' '}
              <span className="text-ink-100">Experimental Web Platform features</span> and restart Chrome. The browser
              can then read the MAC from the cube's advertisement.
            </li>
          </ul>
        </details>

        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={!normalized} onClick={() => normalized && onSubmit(normalized)}>
            Connect
          </button>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
