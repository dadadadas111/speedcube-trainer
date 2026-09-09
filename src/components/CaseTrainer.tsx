/**
 * Luyện case ngẫu nhiên trong một hoặc nhiều họ — kiểu trainer subset của csTimer.
 *
 * App bốc ngẫu nhiên một case trong phạm vi bạn chọn, dẫn bạn vặn khối vào case
 * đó, rồi tính giờ từ lúc khối vào case tới lúc giải xong. Case nào chưa luyện
 * lần nào thì được bốc trúng nhiều hơn, để không bỏ sót.
 *
 * Một điểm phải nói thẳng: chuỗi setup chính là alg đảo ngược, nên nhìn cả chuỗi
 * là biết luôn case. Vì thế mặc định app chỉ hiện TỪNG NƯỚC MỘT — vặn theo kiểu
 * máy móc thì lúc vặn xong vẫn phải tự nhận dạng. Muốn xem cả chuỗi thì có nút.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AlgEntry, Rep } from '../store/db';
import { db } from '../store/db';
import { invertAlg, parseAlg } from '../cube/alg';
import { SOLVED_STATE, isSolved, cloneState, type CubeState } from '../cube/cube';
import { ScrambleTracker, type ScrambleProgress } from '../analysis/scrambleGuide';
import { DrillMatcher, caseStateFor } from '../analysis/drill';
import { useCubeInput } from '../smartcube/useCubeInput';
import { formatSeconds } from '../analysis/stats';
import CubeView from './CubeView';
import ScrambleGuide, { ScrambleHint } from './ScrambleGuide';

type Phase = 'idle' | 'setup' | 'armed' | 'running' | 'done';

interface Attempt {
  algId: number;
  execMs: number;
  recognitionMs: number;
  moveTimes: (number | null)[];
}

interface Props {
  pool: AlgEntry[];
  usingCube: boolean;
  keyboard: boolean;
  repCounts: Map<number, number>;
  onRepSaved: () => void;
}

/** Bốc case ngẫu nhiên, ưu tiên case chưa luyện và tránh lặp lại case vừa rồi. */
function pickCase(pool: AlgEntry[], repCounts: Map<number, number>, avoidId: number | null): AlgEntry | null {
  const candidates = pool.filter((a) => a.id != null && (pool.length === 1 || a.id !== avoidId));
  if (!candidates.length) return null;
  const weights = candidates.map((a) => ((repCounts.get(a.id!) ?? 0) === 0 ? 3 : 1));
  const total = weights.reduce((x, y) => x + y, 0);
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

export default function CaseTrainer({ pool, usingCube, keyboard, repCounts, onRepSaved }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [target, setTarget] = useState<AlgEntry | null>(null);
  const [progress, setProgress] = useState<ScrambleProgress | null>(null);
  const [reveal, setReveal] = useState(false);
  const [last, setLast] = useState<{ entry: AlgEntry; execMs: number; recognitionMs: number } | null>(null);
  const [cubeState, setCubeState] = useState<CubeState>(cloneState(SOLVED_STATE));
  const [history, setHistory] = useState<Attempt[]>([]);

  const phaseRef = useRef<Phase>('idle');
  const targetRef = useRef<AlgEntry | null>(null);
  const trackerRef = useRef<ScrambleTracker | null>(null);
  const matcherRef = useRef<DrillMatcher | null>(null);
  const armedAtRef = useRef(0);
  const cubeRef = useRef<CubeState>(cloneState(SOLVED_STATE));

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const moves = useMemo(() => {
    if (!target) return [];
    try {
      return parseAlg(target.alg);
    } catch {
      return [];
    }
  }, [target]);

  const setup = useMemo(() => {
    if (!moves.length) return [];
    // Đảo ngược alg là ra case, thêm một nước U ngẫu nhiên để còn phải tự canh AUF
    const auf = ['', 'U', "U'", 'U2'][Math.floor(Math.random() * 4)];
    return auf ? [...invertAlg(moves), auf] : invertAlg(moves);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves, target?.id]);

  const nextCase = useCallback(() => {
    const picked = pickCase(pool, repCounts, targetRef.current?.id ?? null);
    targetRef.current = picked;
    setTarget(picked);
    setLast(null);
    matcherRef.current = null;
    setPhaseBoth(picked ? 'setup' : 'idle');
  }, [pool, repCounts]);

  // Đổi phạm vi thì dừng lại, tránh đang luyện họ này lại nhảy sang họ khác
  useEffect(() => {
    setPhaseBoth('idle');
    setTarget(null);
    targetRef.current = null;
    setHistory([]);
  }, [pool]);

  // Dựng lại bộ dẫn mỗi khi có case mới
  useEffect(() => {
    if (!setup.length) return;
    const tracker = new ScrambleTracker(setup);
    trackerRef.current = tracker;
    setProgress(tracker.update(cubeRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup]);

  const finish = useCallback(
    async (execMs: number, recognitionMs: number, moveTimes: (number | null)[]) => {
      const entry = targetRef.current;
      if (!entry?.id) return;
      setPhaseBoth('done');
      setLast({ entry, execMs, recognitionMs });
      setHistory((h) => [...h, { algId: entry.id!, execMs, recognitionMs, moveTimes }]);
      const rep: Omit<Rep, 'id'> = {
        algId: entry.id,
        date: Date.now(),
        recognitionMs,
        execMs,
        moveTimes,
        extraMoves: 0,
        success: true,
      };
      await db.reps.add(rep);
      onRepSaved();
    },
    [onRepSaved],
  );

  useCubeInput(
    {
      onState: (s) => {
        cubeRef.current = s;
        setCubeState(s);
        const p = phaseRef.current;
        if (p !== 'setup' && p !== 'done') return;
        const tracker = trackerRef.current;
        if (!tracker) return;
        const next = tracker.update(s);
        setProgress(next);
        if (next.status === 'complete' && targetRef.current) {
          matcherRef.current = new DrillMatcher(parseAlg(targetRef.current.alg), caseStateFor(parseAlg(targetRef.current.alg), SOLVED_STATE));
          armedAtRef.current = performance.now();
          setPhaseBoth('armed');
        }
      },
      onMove: (m, state) => {
        const p = phaseRef.current;
        if (p === 'setup') {
          const tracker = trackerRef.current;
          if (!tracker) return;
          const next = tracker.update(state, m.move);
          setProgress(next);
          if (next.status === 'complete' && targetRef.current) {
            const alg = parseAlg(targetRef.current.alg);
            matcherRef.current = new DrillMatcher(alg, caseStateFor(alg, SOLVED_STATE));
            armedAtRef.current = performance.now();
            setPhaseBoth('armed');
          }
          return;
        }
        if (p !== 'armed' && p !== 'running') return;

        const t = m.cubeTs ?? m.localTs;
        if (p === 'armed') {
          startRef.current = t;
          setPhaseBoth('running');
        }
        // Vẫn chạy bộ so khớp để lấy được thời gian từng nước KHI người dùng
        // dùng đúng alg đã lưu; dùng alg khác thì chỉ tính tổng thời gian.
        const res = matcherRef.current?.feed(state, t);
        if (isSolved(state)) {
          const execMs = Math.max(0, t - startRef.current);
          const recognitionMs = Math.max(0, startRef.current - armedAtRef.current);
          const matched = res?.event === 'complete' ? res.moveTimes : [];
          void finish(execMs, recognitionMs, matched);
        }
      },
    },
    keyboard,
  );

  const startRef = useRef(0);

  const stats = useMemo(() => {
    const byAlg = new Map<number, number[]>();
    for (const h of history) {
      if (!byAlg.has(h.algId)) byAlg.set(h.algId, []);
      byAlg.get(h.algId)!.push(h.execMs);
    }
    return [...byAlg.entries()]
      .map(([algId, times]) => {
        const entry = pool.find((a) => a.id === algId);
        const sorted = [...times].sort((a, b) => a - b);
        return {
          algId,
          label: entry ? entry.family + ' · ' + entry.name : '?',
          reps: times.length,
          medianMs: sorted[sorted.length >> 1],
          bestMs: sorted[0],
        };
      })
      .sort((a, b) => b.medianMs - a.medianMs);
  }, [history, pool]);

  if (!usingCube) {
    return (
      <section className="panel p-5">
        <h2 className="text-base font-semibold">Luyện case ngẫu nhiên</h2>
        <p className="mt-2 max-w-[60ch] text-sm text-ink-400">
          Chế độ này cần smart cube để biết bạn đã vặn vào đúng case chưa và tự bấm giờ. Kết nối cube ở góc
          trên, hoặc bật khối ảo bàn phím trong Cài đặt để thử.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Luyện case ngẫu nhiên</h2>
            <p className="text-[13px] text-ink-400">
              {pool.length} case trong phạm vi · đã làm {history.length} lượt
            </p>
          </div>
          <div className="flex gap-2">
            {phase === 'idle' || phase === 'done' ? (
              <button className="btn btn-primary" onClick={nextCase} disabled={!pool.length}>
                {phase === 'done' ? 'Case tiếp theo' : 'Bắt đầu'}
              </button>
            ) : (
              <button className="btn" onClick={nextCase}>
                Bỏ qua case này
              </button>
            )}
            {phase !== 'idle' && (
              <button
                className="btn"
                onClick={() => {
                  setPhaseBoth('idle');
                  setTarget(null);
                  targetRef.current = null;
                }}
              >
                Dừng
              </button>
            )}
          </div>
        </div>

        {phase === 'idle' && (
          <p className="mt-4 max-w-[62ch] text-sm text-ink-300">
            App sẽ bốc ngẫu nhiên một case trong phạm vi, dẫn bạn vặn khối vào case đó, rồi tính giờ từ lúc
            khối vào case tới lúc giải xong. Case chưa luyện lần nào được bốc trúng nhiều hơn.
          </p>
        )}

        {phase !== 'idle' && target && (
          <div className="mt-5 grid gap-5 md:grid-cols-[190px_minmax(0,1fr)]">
            <div>
              <p className="mb-1.5 text-[13px] text-ink-400">Khối của bạn</p>
              <CubeView state={cubeState} size={170} />
            </div>
            <div>
              {phase === 'setup' && (
                <>
                  <ScrambleHint progress={progress} notReady={false} />
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-1 w-40 overflow-hidden rounded-full bg-ink-800">
                      <div
                        className="h-full bg-cube-blue"
                        style={{ width: ((progress?.done ?? 0) / Math.max(1, setup.length)) * 100 + '%' }}
                      />
                    </div>
                    <button className="btn btn-ghost !px-2 !py-0.5 !text-[12px]" onClick={() => setReveal(!reveal)}>
                      {reveal ? 'Ẩn chuỗi' : 'Hiện cả chuỗi'}
                    </button>
                  </div>
                  {reveal && (
                    <div className="mt-3">
                      <ScrambleGuide moves={setup} progress={progress} />
                      <p className="mt-1 text-[12px] text-ink-500">
                        Chuỗi này là alg đảo ngược, nhìn cả chuỗi là biết case.
                      </p>
                    </div>
                  )}
                </>
              )}

              {phase === 'armed' && (
                <>
                  <p className="armed text-lg font-semibold text-good">Đúng case rồi — nhận dạng và giải đi</p>
                  <p className="mt-1 text-sm text-ink-300">Nước đầu tiên bắt đầu tính giờ.</p>
                </>
              )}

              {phase === 'running' && <p className="text-lg font-semibold text-cube-blue">Đang chạy…</p>}

              {phase === 'done' && last && (
                <>
                  <p className="text-lg font-semibold text-good">{formatSeconds(last.execMs)}s</p>
                  <p className="mt-1 text-sm text-ink-300">
                    Case: <span className="text-ink-100">{last.entry.family} · {last.entry.name}</span> · nhận dạng{' '}
                    {formatSeconds(last.recognitionMs)}s
                  </p>
                  <p className="mt-1 font-mono text-[15px] text-ink-200">{last.entry.alg}</p>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {stats.length > 0 && (
        <section className="panel overflow-hidden">
          <header className="flex items-baseline justify-between border-b border-ink-700 px-4 py-3">
            <h2 className="text-sm font-semibold">Case nào đang chậm nhất</h2>
            <span className="text-[13px] text-ink-400">trong phiên luyện này</span>
          </header>
          <table className="data">
            <thead>
              <tr>
                <th>Case</th>
                <th className="text-right">Lượt</th>
                <th className="text-right">Trung vị</th>
                <th className="text-right">Nhanh nhất</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s, i) => (
                <tr key={s.algId}>
                  <td>
                    {i === 0 && stats.length > 1 && <span className="mr-2 text-bad">●</span>}
                    {s.label}
                  </td>
                  <td className="tnum text-right">{s.reps}</td>
                  <td className="tnum text-right font-mono">{formatSeconds(s.medianMs)}</td>
                  <td className="tnum text-right font-mono text-ink-400">{formatSeconds(s.bestMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
