/**
 * Pointing this browser at the store that keeps your solves.
 *
 * Deliberately manual as well as automatic. Sync runs on its own when the app
 * opens and after you stop solving, but the button is here because "did that
 * actually go?" is a question you want answered before closing a phone, not
 * inferred from a lack of complaints.
 */

import { useEffect, useState } from 'react';
import { useApp } from '../store/app';
import {
  checkServer,
  loadConfig,
  loadState,
  resetState,
  saveConfig,
  syncNow,
  type SyncConfig,
  type SyncState,
} from '../sync/client';

export default function SyncPanel() {
  const { bump } = useApp();
  const [config, setConfig] = useState<SyncConfig>({ url: '', user: '', password: '' });
  const [saved, setSaved] = useState(false);
  const [state, setState] = useState<SyncState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const c = await loadConfig();
      if (c) {
        setConfig(c);
        setSaved(true);
      }
      setState(await loadState());
    })();
  }, []);

  const run = async (what: string, fn: () => Promise<string>) => {
    setBusy(what);
    setProblem(null);
    setMessage(null);
    try {
      setMessage(await fn());
      setState(await loadState());
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const test = () =>
    run('test', async () => {
      const r = await checkServer(config);
      await saveConfig(config);
      setSaved(true);
      return `The server answered: ${r.records} records, revision ${r.rev}. Settings saved.`;
    });

  const sync = () =>
    run('sync', async () => {
      const r = await syncNow(config);
      bump();
      const parts = [`sent ${r.pushed}`, `received ${r.applied}`];
      if (r.skipped) parts.push(`${r.skipped} waiting for something else`);
      return parts.join(', ') + '.';
    });

  const again = () =>
    run('again', async () => {
      await resetState();
      const r = await syncNow(config);
      bump();
      return `Read the whole history back: ${r.applied} records.`;
    });

  const forget = () =>
    run('forget', async () => {
      await saveConfig(null);
      await resetState();
      setSaved(false);
      setConfig({ url: '', user: '', password: '' });
      return 'This browser has forgotten the server. Nothing was deleted from it.';
    });

  return (
    <section className="panel p-5">
      <h2 className="text-base font-semibold">Sync</h2>
      <p className="mt-1 max-w-[65ch] text-[13px] text-ink-400">
        A browser's storage belongs to one device by definition, so a phone and a laptop cannot see each other's
        solves without somewhere to put them. Point both at the same address and they hold the same history.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <label className="field-label" htmlFor="sync-url">
            Address
          </label>
          <input
            id="sync-url"
            className="input font-mono !text-[13px]"
            placeholder="https://cube.dash.id.vn/sync"
            value={config.url}
            onChange={(e) => setConfig({ ...config, url: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="sync-user">
            User
          </label>
          <input
            id="sync-user"
            className="input !text-[13px]"
            autoComplete="username"
            value={config.user}
            onChange={(e) => setConfig({ ...config, user: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="sync-pass">
            Password
          </label>
          <input
            id="sync-pass"
            type="password"
            className="input !text-[13px]"
            autoComplete="current-password"
            value={config.password}
            onChange={(e) => setConfig({ ...config, password: e.target.value })}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn !py-1 !text-[13px]" onClick={() => void test()} disabled={!!busy || !config.url}>
          {busy === 'test' ? 'Asking…' : 'Test and save'}
        </button>
        <button
          className="btn btn-primary !py-1 !text-[13px]"
          onClick={() => void sync()}
          disabled={!!busy || !saved}
        >
          {busy === 'sync' ? 'Syncing…' : 'Sync now'}
        </button>
        <button
          className="btn !py-1 !text-[13px]"
          onClick={() => void again()}
          disabled={!!busy || !saved}
          title="Read everything the server holds, from the beginning"
        >
          {busy === 'again' ? 'Reading…' : 'Read it all again'}
        </button>
        {saved && (
          <button className="btn btn-ghost !py-1 !text-[13px]" onClick={() => void forget()} disabled={!!busy}>
            Forget
          </button>
        )}
      </div>

      {message && <p className="mt-3 text-[13px] text-good">{message}</p>}
      {problem && <p className="mt-3 text-[13px] text-bad">{problem}</p>}
      {state && state.lastSyncAt > 0 && (
        <p className="mt-2 text-[12px] text-ink-500">
          Last synced {new Date(state.lastSyncAt).toLocaleString()} · revision {state.lastRev}
        </p>
      )}

      <p className="mt-3 max-w-[65ch] text-[12px] text-ink-500">
        The password is kept in this browser so it can sync without asking. It travels over HTTPS, and the server
        only ever holds your own solves.
      </p>
    </section>
  );
}
