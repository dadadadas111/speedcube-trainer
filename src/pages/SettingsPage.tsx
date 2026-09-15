import { useRef, useState } from 'react';
import { useApp } from '../store/app';
import { exportAll, importAll, db } from '../store/db';
import { KEYMAP_HELP } from '../smartcube/virtual';
import { cubeLink, savedMacs, forgetMac } from '../smartcube/connection';
import CubeSync from '../components/CubeSync';
import SyncPanel from '../components/SyncPanel';
import { recentCrashes, clearCrashes, formatCrash } from '../store/crashLog';

export default function SettingsPage() {
  const { settings, updateSettings, sessions, sessionId, addSession, renameSession, deleteSession, setSession, bump } = useApp();
  const [newSession, setNewSession] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [macs, setMacs] = useState(() => savedMacs());
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    const data = await exportAll();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `speedcube-trainer-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async (file: File) => {
    try {
      await importAll(JSON.parse(await file.text()));
      bump();
      setMessage('Import finished. Reload the page to see everything.');
    } catch (e) {
      setMessage(`Import failed: ${(e as Error).message}`);
    }
  };

  const wipe = async () => {
    if (!confirm('Delete every solve, algorithm and drill rep? This cannot be undone.')) return;
    await Promise.all([db.solves.clear(), db.reps.clear(), db.algs.clear()]);
    bump();
    setMessage('All data deleted.');
  };

  return (
    <div className="flex max-w-[820px] flex-col gap-5">
      <section className="panel p-5">
        <h2 className="text-base font-semibold">Sessions</h2>
        <p className="mt-1 text-[13px] text-ink-400">Separate sessions make comparison easier — for instance one just for a technique you are learning.</p>
        <div className="mt-4 flex flex-col gap-2">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <input
                className="input flex-1"
                value={s.name}
                onChange={(e) => s.id && void renameSession(s.id, e.target.value)}
              />
              <button
                className={`btn !py-1.5 ${sessionId === s.id ? '!border-cube-blue !text-cube-blue' : ''}`}
                onClick={() => s.id && void setSession(s.id)}
              >
                {sessionId === s.id ? 'Active' : 'Use'}
              </button>
              <button
                className="btn btn-danger !py-1.5"
                disabled={sessions.length <= 1}
                onClick={() => s.id && confirm(`Delete session "${s.name}" and every solve in it?`) && void deleteSession(s.id)}
              >
                Delete
              </button>
            </div>
          ))}
          <div className="mt-1 flex gap-2">
            <input
              className="input flex-1"
              placeholder="New session name"
              value={newSession}
              onChange={(e) => setNewSession(e.target.value)}
            />
            <button
              className="btn"
              disabled={!newSession.trim()}
              onClick={() => {
                void addSession(newSession.trim());
                setNewSession('');
              }}
            >
              Create session
            </button>
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-base font-semibold">Timing</h2>
        <div className="mt-4 flex flex-col gap-3">
          <Row label="Analysis method" hint="Decides which steps a solve is broken into.">
            <select
              className="input max-w-[180px]"
              value={settings.method}
              onChange={(e) => void updateSettings({ method: e.target.value as 'roux' | 'cfop' | 'auto' })}
            >
              <option value="roux">Roux</option>
              <option value="cfop">CFOP</option>
              <option value="auto">Auto detect</option>
            </select>
          </Row>
          <Toggle
            label="Guided scrambling"
            hint="Shows one move at a time, flags a wrong turn immediately, and only arms the timer once the scramble is right. Off, the clock starts on any first move."
            value={settings.requireScrambleMatch}
            onChange={(v) => void updateSettings({ requireScrambleMatch: v })}
          />
          <Toggle
            label="Inspection"
            hint="Counts down once the cube matches the scramble. The first move starts the timer."
            value={settings.useInspection}
            onChange={(v) => void updateSettings({ useInspection: v })}
          />
          <Toggle
            label="Scramble random-state"
            hint="WCA standard. Turn it off on a slow device — random moves are used instead."
            value={settings.randomStateScramble}
            onChange={(v) => void updateSettings({ randomStateScramble: v })}
          />
          <Toggle
            label="Keyboard cube"
            hint="Try the app out before pairing a smart cube."
            value={settings.keyboardCube}
            onChange={(v) => void updateSettings({ keyboardCube: v })}
          />
          {settings.keyboardCube && (
            <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
              <p className="mb-2 text-[13px] text-ink-300">Hold Shift for a half turn (Shift+i = R2, for example).</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
                {KEYMAP_HELP.map(([k, v]) => (
                  <div key={k} className="flex justify-between font-mono text-[13px]">
                    <span className="text-ink-400">{k}</span>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-base font-semibold">Cube display</h2>
        <div className="mt-4 flex flex-col gap-3">
          <Row label="Cube style" hint="3D can be dragged to rotate; the net shows all six faces at once.">
            <div className="flex gap-1">
              <button
                className={`btn !py-1 !text-[13px] ${settings.cubeView === '3d' ? '!border-cube-blue !text-cube-blue' : ''}`}
                onClick={() => void updateSettings({ cubeView: '3d' })}
              >
                3D
              </button>
              <button
                className={`btn !py-1 !text-[13px] ${settings.cubeView === 'net' ? '!border-cube-blue !text-cube-blue' : ''}`}
                onClick={() => void updateSettings({ cubeView: 'net' })}
              >
                Net
              </button>
            </div>
          </Row>
          <Toggle
            label="On-screen cube follows your hands"
            hint="Uses the cube's gyroscope. Experimental — untested against a real cube, so if the axes look wrong, switch it off and say so."
            value={settings.useGyro}
            onChange={(v) => void updateSettings({ useGyro: v })}
          />
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-base font-semibold">When the app and the cube disagree</h2>
        <div className="mt-3">
          <CubeSync />
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-base font-semibold">How pauses are counted</h2>
        <p className="mt-1 max-w-[65ch] text-[13px] text-ink-400">
          A gap counts as a pause when it is longer than the fixed floor AND longer than a multiple of the median
          gap between moves in that same solve. That way the threshold scales with your speed.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="pmin">
              Floor: {settings.pauseMinMs}ms
            </label>
            <input
              id="pmin"
              type="range"
              min={80}
              max={500}
              step={10}
              value={settings.pauseMinMs}
              onChange={(e) => void updateSettings({ pauseMinMs: Number(e.target.value) })}
              className="w-full"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="pfac">
              Median multiple: {settings.pauseFactor.toFixed(1)}×
            </label>
            <input
              id="pfac"
              type="range"
              min={1.4}
              max={4}
              step={0.1}
              value={settings.pauseFactor}
              onChange={(e) => void updateSettings({ pauseFactor: Number(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-base font-semibold">Data</h2>
        <p className="mt-1 max-w-[65ch] text-[13px] text-ink-400">
          Everything lives in this browser on your machine and is never sent anywhere. Clearing your browser data
          wipes it, so export a backup now and then.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn" onClick={() => void doExport()}>
            Export backup
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import from file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => e.target.files?.[0] && void doImport(e.target.files[0])}
          />
          <button className="btn btn-danger" onClick={() => void wipe()}>
            Delete all data
          </button>
        </div>
        {message && <p className="mt-3 text-sm text-warn">{message}</p>}
      </section>

      <SyncPanel />

      <section className="panel p-5">
        <h2 className="text-base font-semibold">Smart cube</h2>
        <p className="mt-1 max-w-[65ch] text-[13px] text-ink-400">
          Supports GAN Gen2/Gen3/Gen4 over Web Bluetooth. Needs Chrome or Edge — Safari and iOS have no Web
          Bluetooth.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
          <span className="text-ink-400">
            This browser {typeof navigator !== 'undefined' && 'bluetooth' in navigator ? 'supports' : 'does not support'} Web Bluetooth
          </span>
          {cubeLink.info && (
            <span className="font-mono text-ink-300">
              {cubeLink.info.name} · {cubeLink.info.hardware ?? '?'} · battery {cubeLink.info.battery ?? '?'}%
            </span>
          )}
        </div>

        <CubeLog />
        <CrashLog />

        <h3 className="mt-5 text-sm font-semibold">Saved MAC addresses</h3>
        <p className="mt-1 max-w-[65ch] text-[13px] text-ink-400">
          GAN encrypts its data with a key salted from the MAC address, so one is required. Chrome on desktop reads
          it automatically; on a phone you usually type it once, unless you enable
          <span className="font-mono text-ink-300"> chrome://flags</span> →{' '}
          <span className="text-ink-300">Experimental Web Platform features</span>. With a wrong MAC the cube still
          connects but the data is garbage — delete it here and reconnect to enter it again.
        </p>
        {macs.length === 0 ? (
          <p className="mt-3 text-[13px] text-ink-500">No MAC saved yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {macs.map((m) => (
              <li key={m.key} className="flex flex-wrap items-center gap-3">
                <span className="text-[13px] text-ink-200">{m.label}</span>
                <span className="font-mono text-[13px] text-ink-400">{m.mac}</span>
                <button
                  className="btn btn-danger !py-0.5 !text-[12px]"
                  onClick={() => {
                    forgetMac(m.key);
                    setMacs(savedMacs());
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="max-w-[46ch]">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-[13px] text-ink-400">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row label={label} hint={hint}>
      <button
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
        style={{ background: value ? 'var(--color-cube-blue)' : 'var(--color-ink-600)' }}
      >
        <span
          className="absolute top-0.5 size-5 rounded-full bg-white transition-[left]"
          style={{ left: value ? '1.375rem' : '0.125rem' }}
        />
      </button>
    </Row>
  );
}


/**
 * What the cube has been doing lately.
 *
 * A bluetooth link that drops mid-scramble leaves nothing behind to look at, so
 * the connection keeps a short log of what it saw — moves with their serial
 * numbers, every command sent, and whether the link was closed here or given up
 * by the cube. Copy it out when something goes wrong.
 */
/**
 * Crashes that survived the reload after them.
 *
 * Sits beside the connection log because the two are usually read together:
 * what the cube was doing, and what broke while it did it.
 */
function CrashLog() {
  const [, force] = useState(0);
  const crashes = recentCrashes();
  if (!crashes.length) return null;
  const text = crashes.map(formatCrash).join('\n\n');
  return (
    <details className="mt-5">
      <summary className="cursor-pointer text-sm font-semibold text-bad">
        Crashes ({crashes.length})
      </summary>
      <p className="mt-1 text-[12px] text-ink-500">
        Kept across reloads. Copy this into a bug report — it says what broke and where.
      </p>
      <div className="mt-2 flex gap-2">
        <button className="btn !py-1 !text-[12px]" onClick={() => void navigator.clipboard?.writeText(text)}>
          Copy
        </button>
        <button
          className="btn !py-1 !text-[12px]"
          onClick={() => {
            clearCrashes();
            force((n) => n + 1);
          }}
        >
          Clear
        </button>
      </div>
      <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-ink-700 bg-ink-900 p-3 font-mono text-[12px] leading-relaxed text-ink-300">
        {text}
      </pre>
    </details>
  );
}

function CubeLog() {
  const [, force] = useState(0);
  const entries = cubeLink.log;
  const text = entries
    .map((e) => `${new Date(e.t).toLocaleTimeString('en-GB')}.${String(e.t % 1000).padStart(3, '0')}  ${e.kind}${e.detail ? '  ' + e.detail : ''}`)
    .join('\n');
  return (
    <details className="mt-5">
      <summary className="cursor-pointer text-sm font-semibold">Connection log ({entries.length})</summary>
      <div className="mt-2 flex gap-2">
        <button className="btn !py-1 !text-[12px]" onClick={() => force((n) => n + 1)}>
          Refresh
        </button>
        <button
          className="btn !py-1 !text-[12px]"
          disabled={!entries.length}
          onClick={() => void navigator.clipboard?.writeText(text)}
        >
          Copy
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-500">Nothing yet.</p>
      ) : (
        <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-ink-700 bg-ink-900 p-3 font-mono text-[12px] leading-relaxed text-ink-300">
          {text}
        </pre>
      )}
    </details>
  );
}
