import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/app';
import { db, type Solve, type Penalty } from '../store/db';
import { generateScramble, type ScrambleSource } from '../cube/scramble';
import { SOLVED_STATE, applyMoves, isSolved, cloneState, type CubeState } from '../cube/cube';
import { normalizeTimestamps, type LiveMove } from '../smartcube/connection';
import { useCubeInput } from '../smartcube/useCubeInput';
import { useCubeGyro } from '../smartcube/useCubeGyro';
import { virtualCube } from '../smartcube/virtual';
import { ScrambleTracker, isAtStart, type ScrambleProgress } from '../analysis/scrambleGuide';
import { analyzeSolveRecord } from '../analysis/pipeline';
import { averageOf, effectiveTime, formatTime } from '../analysis/stats';
import CubeView from '../components/CubeView';
import ScrambleGuide, { ScrambleHint } from '../components/ScrambleGuide';
import CubeSync from '../components/CubeSync';
import PostSolve from '../components/PostSolve';
import StepRibbon from '../components/StepRibbon';

type Phase = 'scrambling' | 'ready' | 'inspecting' | 'holding' | 'armed' | 'running' | 'done';

const HOLD_MS = 350;

export default function TimerPage({ onOpenSolve }: { onOpenSolve: (id: number) => void }) {
  const { settings, sessionId, cubeStatus, bump, revision } = useApp();
  const usingCube = cubeStatus === 'connected' || settings.keyboardCube;

  const [scramble, setScramble] = useState<string[]>([]);
  const [scrambleSource, setScrambleSource] = useState<ScrambleSource>('random-state');
  const [phase, setPhase] = useState<Phase>('scrambling');
  const [display, setDisplay] = useState(0);
  const [inspectLeft, setInspectLeft] = useState(0);
  const [cubeState, setCubeState] = useState<CubeState>(cloneState(SOLVED_STATE));
  const [progress, setProgress] = useState<ScrambleProgress | null>(null);
  const [lastSolve, setLastSolve] = useState<Solve | null>(null);
  const [recent, setRecent] = useState<Solve[]>([]);

  const phaseRef = useRef<Phase>('scrambling');
  const movesRef = useRef<LiveMove[]>([]);
  const startRef = useRef(0);
  const scrambleRef = useRef<string[]>([]);
  const trackerRef = useRef<ScrambleTracker | null>(null);
  const rafRef = useRef(0);
  const holdRef = useRef<number | null>(null);

  const quaternion = useCubeGyro(settings.useGyro && cubeStatus === 'connected');

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const targetState = useMemo(() => applyMoves(SOLVED_STATE, scramble), [scramble]);

  /* ---------- scramble mới ---------- */
  const newScramble = useCallback(async () => {
    const { moves, source } = await generateScramble(settings.randomStateScramble);
    scrambleRef.current = moves;
    setScramble(moves);
    setScrambleSource(source);
    setDisplay(0);
    const tracker = new ScrambleTracker(moves);
    trackerRef.current = tracker;
    setProgress(usingCube ? tracker.update(cubeStateRef.current) : null);
    setPhaseBoth(usingCube && settings.requireScrambleMatch ? 'scrambling' : 'ready');
  }, [settings.randomStateScramble, settings.requireScrambleMatch, usingCube, setPhaseBoth]);

  // giữ trạng thái khối mới nhất cho các callback không phụ thuộc render
  const cubeStateRef = useRef<CubeState>(cloneState(SOLVED_STATE));

  useEffect(() => {
    void newScramble();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRecent = useCallback(async () => {
    const rows = await db.solves.where('sessionId').equals(sessionId).reverse().sortBy('date');
    setRecent(rows.slice(0, 60));
  }, [sessionId]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent, revision]);

  /* ---------- đồng hồ ---------- */
  const tick = useCallback(() => {
    setDisplay(performance.now() - startRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopRaf = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  };

  const finishSolve = useCallback(
    async (timeMs: number, moves: LiveMove[], source: 'smartcube' | 'manual') => {
      stopRaf();
      setDisplay(timeMs);
      setPhaseBoth('done');
      const solve: Solve = {
        sessionId,
        date: Date.now(),
        scramble: scrambleRef.current.join(' '),
        timeMs,
        penalty: 'none',
        source,
        moves: source === 'smartcube' ? normalizeTimestamps(moves) : [],
      };
      const id = await db.solves.add(solve);
      setLastSolve({ ...solve, id });
      bump();
      void newScramble();
    },
    [sessionId, bump, newScramble, setPhaseBoth],
  );

  /* ---------- nhập từ khối ---------- */
  useCubeInput(
    {
      onState: (s) => {
        cubeStateRef.current = s;
        setCubeState(s);
        // Trạng thái có thể đổi mà không qua nước nào (cube gửi lại facelets sau
        // khi đồng bộ) — cập nhật lại tiến độ cho khớp.
        if (phaseRef.current === 'scrambling' && trackerRef.current) {
          setProgress(trackerRef.current.update(s));
        }
      },
      onMove: (m, state) => {
        const p = phaseRef.current;

        if (p === 'scrambling') {
          const tracker = trackerRef.current;
          if (!tracker) return;
          const next = tracker.update(state, m.move);
          setProgress(next);
          if (next.status === 'complete') {
            setPhaseBoth(settings.useInspection ? 'inspecting' : 'ready');
            if (settings.useInspection) setInspectLeft(settings.inspectionSeconds * 1000);
          }
          return;
        }

        if (p === 'ready' || p === 'inspecting') {
          movesRef.current = [m];
          startRef.current = performance.now();
          setPhaseBoth('running');
          setInspectLeft(0);
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        if (p === 'running') {
          movesRef.current.push(m);
          if (isSolved(state)) {
            const norm = normalizeTimestamps(movesRef.current);
            const t = norm[norm.length - 1]?.t ?? performance.now() - startRef.current;
            void finishSolve(t, movesRef.current, 'smartcube');
          }
        }
      },
    },
    settings.keyboardCube,
  );

  /**
   * Cắm hoặc rút cube giữa chừng thì đổi cách bấm giờ cho khớp: có cube thì
   * chuyển sang chế độ dẫn scramble, không có thì quay về bấm phím cách.
   */
  useEffect(() => {
    const p = phaseRef.current;
    if (p === 'running' || p === 'holding' || p === 'armed') return;
    if (usingCube && settings.requireScrambleMatch) {
      const tracker = new ScrambleTracker(scrambleRef.current);
      trackerRef.current = tracker;
      const next = tracker.update(cubeStateRef.current);
      setProgress(next);
      setPhaseBoth(next.status === 'complete' ? 'ready' : 'scrambling');
    } else {
      trackerRef.current = null;
      setProgress(null);
      setPhaseBoth('ready');
    }
  }, [usingCube, settings.requireScrambleMatch, setPhaseBoth]);

  // Đếm ngược inspection
  useEffect(() => {
    if (phase !== 'inspecting') return;
    const started = performance.now();
    const total = settings.inspectionSeconds * 1000;
    const id = setInterval(() => setInspectLeft(Math.max(0, total - (performance.now() - started))), 50);
    return () => clearInterval(id);
  }, [phase, settings.inspectionSeconds]);

  /* ---------- bấm giờ bằng phím cách ---------- */
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const p = phaseRef.current;
      if (p === 'running' && !usingCube) {
        e.preventDefault();
        stopRaf();
        void finishSolve(performance.now() - startRef.current, [], 'manual');
        return;
      }
      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      if (usingCube) return; // có khối thật thì nước đầu tiên tự khởi động
      if (p !== 'running') {
        setPhaseBoth('holding');
        holdRef.current = window.setTimeout(() => setPhaseBoth('armed'), HOLD_MS);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (isTyping(e) || e.code !== 'Space') return;
      e.preventDefault();
      if (holdRef.current) {
        clearTimeout(holdRef.current);
        holdRef.current = null;
      }
      const p = phaseRef.current;
      if (p === 'armed') {
        startRef.current = performance.now();
        setPhaseBoth('running');
        rafRef.current = requestAnimationFrame(tick);
      } else if (p === 'holding') {
        setPhaseBoth('ready');
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [usingCube, tick, finishSolve, setPhaseBoth]);

  useEffect(() => () => stopRaf(), []);

  /* ---------- dẫn xuất ---------- */
  const analysis = useMemo(() => (lastSolve ? analyzeSolveRecord(lastSolve, settings) : null), [lastSolve, settings]);
  const times = useMemo(() => recent.map(effectiveTime), [recent]);
  const finiteTimes = times.filter(isFinite);
  const ao5 = averageOf(times.slice(0, 5));
  const ao12 = averageOf(times.slice(0, 12));
  const best = finiteTimes.length ? Math.min(...finiteTimes) : NaN;

  /**
   * Chỉ báo "khối chưa giải" khi app thật sự bó tay: đang lạc đường mà lại không
   * biết người dùng đã vặn gì nên không dựng được gợi ý sửa. Nếu biết thì cứ đưa
   * gợi ý vặn ngược, kể cả khi mới sai đúng một nước đầu tiên.
   */
  const notReady =
    usingCube &&
    phase === 'scrambling' &&
    progress?.status === 'off-track' &&
    progress.fix.length === 0 &&
    !isAtStart(cubeState);

  const applyPenalty = async (solve: Solve, penalty: Penalty) => {
    if (!solve.id) return;
    await db.solves.update(solve.id, { penalty });
    setLastSolve({ ...solve, penalty });
    bump();
  };

  const deleteSolve = async (solve: Solve) => {
    if (!solve.id) return;
    await db.solves.delete(solve.id);
    if (lastSolve?.id === solve.id) setLastSolve(null);
    bump();
  };

  if (phase === 'running') {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center">
        <div className="tnum font-mono text-[clamp(4rem,16vw,11rem)] font-semibold leading-none text-ink-100">
          {formatTime(display)}
        </div>
        <p className="mt-6 text-sm text-ink-400">
          {usingCube ? 'Giải xong là đồng hồ tự dừng.' : 'Bấm phím bất kỳ để dừng.'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-h-0 flex-col gap-5">
        <section className="panel p-5">
          <div className="mb-1 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <ScrambleGuide moves={scramble} progress={phase === 'scrambling' ? progress : null} />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <button className="btn btn-ghost" onClick={() => void newScramble()} title="Đổi scramble khác">
                Đổi
              </button>
              {settings.randomStateScramble && scrambleSource === 'random-move' && (
                <span className="text-[11px] text-warn" title="Không nạp được bộ sinh random-state; đang tạm dùng scramble ngẫu nhiên theo nước.">
                  random-move
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-start gap-5 border-t border-ink-700 pt-4">
            <div>
              <p className="mb-1.5 text-[13px] text-ink-400">
                {usingCube && phase === 'scrambling' ? 'Khối của bạn' : 'Sau khi scramble'}
              </p>
              <CubeView
                state={usingCube && phase === 'scrambling' ? cubeState : targetState}
                size={190}
                quaternion={usingCube && phase === 'scrambling' ? quaternion : null}
              />
            </div>
            <div className="min-w-[14rem] flex-1">
              {phase === 'inspecting' ? (
                <div>
                  <p className="tnum font-mono text-4xl font-semibold text-warn">{(inspectLeft / 1000).toFixed(1)}</p>
                  <p className="text-[13px] text-ink-400">Nước đầu tiên bắt đầu tính giờ.</p>
                </div>
              ) : phase === 'ready' && usingCube ? (
                <p className="armed text-lg font-semibold text-good">
                  {settings.requireScrambleMatch ? 'Scramble xong' : 'Sẵn sàng'} — vặn nước đầu là chạy
                </p>
              ) : phase === 'armed' ? (
                <p className="text-lg font-semibold text-good">Thả tay là chạy</p>
              ) : phase === 'holding' ? (
                <p className="text-lg font-semibold text-warn">Giữ thêm chút nữa…</p>
              ) : !usingCube ? (
                <p className="text-sm text-ink-300">
                  Giữ phím cách để bấm giờ tay, hoặc kết nối smart cube ở góc trên để được dẫn vặn scramble.
                </p>
              ) : (
                <ScrambleHint progress={progress} notReady={!!notReady} />
              )}

              {usingCube && phase === 'scrambling' && (progress?.status === 'off-track' || notReady) && (
                <div className="mt-4">
                  <CubeSync compact />
                </div>
              )}
              {settings.keyboardCube && phase === 'scrambling' && (
                <button
                  className="btn btn-ghost mt-3 !px-2 !py-1 !text-[13px]"
                  onClick={() => virtualCube.setState(applyMoves(SOLVED_STATE, scramble))}
                >
                  Vặn hộ khối ảo theo scramble
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="panel p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div>
              <div className="tnum font-mono text-[clamp(2.75rem,8vw,5rem)] font-semibold leading-none">
                {lastSolve && lastSolve.penalty === 'DNF' ? 'DNF' : formatTime(display)}
                {lastSolve?.penalty === '+2' && <span className="text-bad">+2</span>}
              </div>
              {lastSolve && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className={`btn !py-1 !text-[13px] ${lastSolve.penalty === '+2' ? '!border-warn !text-warn' : ''}`}
                    onClick={() => void applyPenalty(lastSolve, lastSolve.penalty === '+2' ? 'none' : '+2')}
                  >
                    +2
                  </button>
                  <button
                    className={`btn !py-1 !text-[13px] ${lastSolve.penalty === 'DNF' ? '!border-bad !text-bad' : ''}`}
                    onClick={() => void applyPenalty(lastSolve, lastSolve.penalty === 'DNF' ? 'none' : 'DNF')}
                  >
                    DNF
                  </button>
                  <button className="btn btn-danger !py-1 !text-[13px]" onClick={() => void deleteSolve(lastSolve)}>
                    Xoá
                  </button>
                </div>
              )}
            </div>
            <dl className="flex gap-6">
              <Stat label="ao5" value={formatTime(ao5)} />
              <Stat label="ao12" value={formatTime(ao12)} />
              <Stat label="tốt nhất" value={formatTime(best)} />
            </dl>
          </div>
          {lastSolve && (
            <div className="mt-5 border-t border-ink-700 pt-4">
              <PostSolve analysis={analysis} onOpenReplay={lastSolve.id ? () => onOpenSolve(lastSolve.id!) : undefined} />
            </div>
          )}
        </section>
      </div>

      <section className="panel flex max-h-[60vh] flex-col overflow-hidden xl:max-h-[calc(100vh-8.5rem)]">
        <header className="flex items-baseline justify-between border-b border-ink-700 px-4 py-3">
          <h2 className="text-sm font-semibold">Solve trong phiên</h2>
          <span className="tnum text-[13px] text-ink-400">{recent.length}</span>
        </header>
        <div className="overflow-y-auto">
          {recent.length === 0 && (
            <p className="px-4 py-6 text-sm text-ink-400">
              Chưa có solve nào. Vặn khối theo scramble ở trên rồi giải — đồng hồ tự chạy.
            </p>
          )}
          {recent.map((s, i) => (
            <SolveRow key={s.id} solve={s} index={recent.length - i} onOpen={() => s.id && onOpenSolve(s.id)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[13px] text-ink-400">{label}</dt>
      <dd className="tnum font-mono text-lg text-ink-100">{value}</dd>
    </div>
  );
}

function SolveRow({ solve, index, onOpen }: { solve: Solve; index: number; onOpen: () => void }) {
  const { settings } = useApp();
  const a = useMemo(() => analyzeSolveRecord(solve, settings), [solve, settings]);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 border-b border-ink-800 px-4 py-2.5 text-left hover:bg-ink-800"
    >
      <span className="tnum w-6 shrink-0 text-[13px] text-ink-500">{index}</span>
      <span className="tnum w-16 shrink-0 font-mono text-[15px]">
        {solve.penalty === 'DNF' ? <span className="text-bad">DNF</span> : formatTime(effectiveTime(solve))}
      </span>
      <span className="min-w-0 flex-1">
        {a ? (
          <StepRibbon steps={a.steps} totalMs={a.totalMs} height={6} />
        ) : (
          <span className="text-[12px] text-ink-500">bấm tay</span>
        )}
      </span>
    </button>
  );
}
