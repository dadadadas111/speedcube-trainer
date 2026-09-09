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
  { id: 'timer', label: 'Bấm giờ', icon: '⏱' },
  { id: 'solves', label: 'Solve', icon: '≡' },
  { id: 'stats', label: 'Thống kê', icon: '◲' },
  { id: 'drill', label: 'Drill alg', icon: '◈' },
  { id: 'settings', label: 'Cài đặt', icon: '⚙' },
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

  if (!ready) {
    return <div className="grid min-h-screen place-items-center text-sm text-ink-400">Đang mở dữ liệu…</div>;
  }

  return (
    <div className="flex min-h-screen">
      {/* Bọc thêm một lớp để nền thanh điều hướng kéo hết chiều cao trang,
          còn phần nội dung bên trong vẫn dính theo màn hình khi cuộn. */}
      <div className="w-14 shrink-0 border-r border-ink-800 bg-ink-850 sm:w-[168px]">
        <nav className="sticky top-0 flex h-screen flex-col items-center gap-1 py-3 sm:items-stretch sm:px-2">
        <div className="mb-4 px-1.5 sm:px-2">
          <div className="flex gap-[3px]">
            <span className="size-2.5 rounded-[2px] bg-cube-blue" />
            <span className="size-2.5 rounded-[2px] bg-cube-green" />
            <span className="size-2.5 rounded-[2px] bg-cube-red" />
          </div>
          <p className="mt-2 hidden text-[13px] font-semibold leading-tight sm:block">
            Speedcube
            <br />
            Trainer
          </p>
        </div>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              if (t.id !== 'solves') setReplayId(null);
            }}
            title={t.label}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              tab === t.id ? 'bg-ink-700 text-ink-100' : 'text-ink-300 hover:bg-ink-800'
            }`}
          >
            <span className="w-4 text-center text-base leading-none">{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2">
            <label className="text-[13px] text-ink-400" htmlFor="session-select">
              Phiên
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

        <main className="min-w-0 flex-1 p-4 sm:p-6">
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
    </div>
  );
}
