import { useEffect, useState } from 'react';
import { useApp } from './store/app';
import CubeStatus from './components/CubeStatus';
import TimerPage from './pages/TimerPage';
import SolvesPage from './pages/SolvesPage';
import ReplayPage from './pages/ReplayPage';
import StatsPage from './pages/StatsPage';
import DrillPage from './pages/DrillPage';
import SettingsPage from './pages/SettingsPage';

type Tab = 'timer' | 'solves' | 'stats' | 'drill' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'timer', label: 'Timer', icon: '⏱' },
  { id: 'solves', label: 'Solves', icon: '≡' },
  { id: 'stats', label: 'Stats', icon: '◲' },
  { id: 'drill', label: 'Drill', icon: '◈' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export default function App() {
  const { ready, init, sessions, sessionId, setSession } = useApp();
  const [tab, setTab] = useState<Tab>('timer');
  const [replayId, setReplayId] = useState<number | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

  const openSolve = (id: number) => {
    setReplayId(id);
    setTab('solves');
  };

  const go = (id: Tab) => {
    setTab(id);
    if (id !== 'solves') setReplayId(null);
    window.scrollTo({ top: 0 });
  };

  if (!ready) {
    return <div className="grid min-h-screen place-items-center text-sm text-ink-400">Opening your data…</div>;
  }

  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
      {/* On phones the nav sits at the bottom, the way apps normally do, so it
          does not eat the little horizontal space there is. From sm up it becomes
          a left-hand column. */}
      <div className="hidden shrink-0 border-r border-ink-800 bg-ink-850 sm:block sm:w-[168px]">
        <nav className="sticky top-0 flex h-screen flex-col gap-1 px-2 py-3">
          <div className="mb-4 px-2">
            <div className="flex gap-[3px]">
              <span className="size-2.5 rounded-[2px] bg-cube-blue" />
              <span className="size-2.5 rounded-[2px] bg-cube-green" />
              <span className="size-2.5 rounded-[2px] bg-cube-red" />
            </div>
            <p className="mt-2 text-[13px] font-semibold leading-tight">
              Speedcube
              <br />
              Trainer
            </p>
          </div>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => go(t.id)}
              title={t.label}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                tab === t.id ? 'bg-ink-700 text-ink-100' : 'text-ink-300 hover:bg-ink-800'
              }`}
            >
              <span className="w-4 text-center text-base leading-none">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="flex min-w-0 flex-1 flex-col pb-[4.25rem] sm:pb-0">
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-ink-800 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex gap-[3px] sm:hidden">
              <span className="size-2.5 rounded-[2px] bg-cube-blue" />
              <span className="size-2.5 rounded-[2px] bg-cube-green" />
              <span className="size-2.5 rounded-[2px] bg-cube-red" />
            </span>
            <label className="text-[13px] text-ink-400" htmlFor="session-select">
              Session
            </label>
            <select
              id="session-select"
              className="input !w-auto !py-1 !text-[13px]"
              value={sessionId}
              onChange={(e) => void setSession(Number(e.target.value))}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <CubeStatus />
        </header>

        <main className="min-w-0 flex-1 p-3 sm:p-6">
          {tab === 'timer' && <TimerPage onOpenSolve={openSolve} />}
          {tab === 'solves' &&
            (replayId != null ? (
              <ReplayPage solveId={replayId} onBack={() => setReplayId(null)} />
            ) : (
              <SolvesPage onOpenSolve={setReplayId} />
            ))}
          {tab === 'stats' && <StatsPage />}
          {tab === 'drill' && <DrillPage />}
          {tab === 'settings' && <SettingsPage />}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-ink-800 bg-ink-850 pb-[env(safe-area-inset-bottom)] sm:hidden"
        aria-label="Navigation"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => go(t.id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${
              tab === t.id ? 'text-cube-blue' : 'text-ink-400'
            }`}
          >
            <span className="text-lg leading-none">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
