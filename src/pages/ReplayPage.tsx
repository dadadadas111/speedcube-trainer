import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/app';
import { db, type Solve } from '../store/db';
import { parseAlg } from '../cube/alg';
import { analyzeSolveRecord } from '../analysis/pipeline';
import { stepFacelets } from '../analysis/method';
import { effectiveTime, formatSeconds, formatTime } from '../analysis/stats';
import CubeNet from '../components/CubeNet';
import StepRibbon from '../components/StepRibbon';
import ScrambleDisplay from '../components/ScrambleDisplay';
import { stepColor } from '../components/palette';
import { verdict } from '../components/PostSolve';

const SPEEDS = [0.25, 0.5, 1, 2];

export default function ReplayPage({ solveId, onBack }: { solveId: number; onBack: () => void }) {
  const { settings } = useApp();
  const [solve, setSolve] = useState<Solve | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [pauseAtSteps, setPauseAtSteps] = useState(true);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    void db.solves.get(solveId).then((s) => {
      setSolve(s ?? null);
      setIndex(0);
    });
  }, [solveId]);

  const analysis = useMemo(() => (solve ? analyzeSolveRecord(solve, settings) : null), [solve, settings]);
  const scramble = useMemo(() => (solve ? parseAlg(solve.scramble) : []), [solve]);

  /** Ranh giới bước theo chỉ số nước, để biết đang ở bước nào */
  const boundaries = useMemo(() => analysis?.steps.map((s) => s.endIndex) ?? [], [analysis]);
  const currentStep = useMemo(() => {
    if (!analysis) return null;
    return analysis.steps.find((s) => index > s.startIndex && index <= s.endIndex) ?? analysis.steps[0] ?? null;
  }, [analysis, index]);

  /** Hướng nhìn: theo bước gần nhất đã hoàn thành, để khối không nhảy lung tung */
  const viewRotation = useMemo(() => {
    if (!analysis) return null;
    let rot: Uint8Array | null = null;
    for (const s of analysis.steps) {
      if (s.detected && s.endIndex <= index) rot = s.rotation;
    }
    return rot ?? analysis.steps.find((s) => s.detected)?.rotation ?? null;
  }, [analysis, index]);

  const total = analysis?.moves.length ?? 0;

  // Phát lại theo đúng nhịp thật của solve
  useEffect(() => {
    if (!playing || !analysis) return;
    if (index >= total) {
      setPlaying(false);
      return;
    }
    const prevT = index === 0 ? 0 : analysis.moves[index - 1].t;
    const delay = Math.min(2500, Math.max(40, (analysis.moves[index].t - prevT) / speed));
    timerRef.current = window.setTimeout(() => {
      const next = index + 1;
      setIndex(next);
      if (pauseAtSteps && boundaries.includes(next) && next < total) setPlaying(false);
    }, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [playing, index, analysis, speed, total, pauseAtSteps, boundaries]);

  if (!solve) return <p className="text-sm text-ink-400">Đang tải…</p>;

  if (!analysis) {
    return (
      <div className="panel p-6">
        <button className="btn btn-ghost mb-4" onClick={onBack}>
          Quay lại
        </button>
        <p className="text-lg">
          {formatTime(effectiveTime(solve))} — {new Date(solve.date).toLocaleString('vi-VN')}
        </p>
        <ScrambleDisplay moves={parseAlg(solve.scramble)} size="md" className="mt-2" />
        <p className="mt-4 text-sm text-ink-400">
          Solve này bấm giờ bằng tay nên không có dữ liệu từng nước để xem lại.
        </p>
      </div>
    );
  }

  const state = analysis.states[index];
  const highlight = currentStep ? stepFacelets(currentStep.key) : null;
  const v = verdict(analysis);
  const elapsed = index === 0 ? 0 : analysis.moves[index - 1].t;

  const jumpToStep = (key: string) => {
    const s = analysis.steps.find((x) => x.key === key);
    if (s) {
      setIndex(s.startIndex);
      setPlaying(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-4">
          <button className="btn btn-ghost" onClick={onBack}>
            Quay lại
          </button>
          <span className="tnum font-mono text-2xl font-semibold">{formatTime(effectiveTime(solve))}</span>
          <span className="text-[13px] text-ink-400">{new Date(solve.date).toLocaleString('vi-VN')}</span>
        </div>
        <ScrambleDisplay moves={scramble} size="md" className="!text-ink-300" />
      </header>

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Khối + điều khiển phát lại */}
        <section className="panel p-4">
          <CubeNet state={state} viewRotation={viewRotation} highlight={highlight} size={260} className="mx-auto" />
          <div className="mt-4 text-center">
            <p className="text-[13px] text-ink-400">
              {currentStep ? currentStep.label : 'Trước khi giải'} · nước {index}/{total}
            </p>
            <p className="tnum mt-0.5 font-mono text-lg">{formatSeconds(elapsed)}s</p>
          </div>
          <div className="mt-4 flex items-center justify-center gap-1.5">
            <button className="btn !px-2.5" onClick={() => { setPlaying(false); setIndex(0); }} title="Về đầu">
              ⏮
            </button>
            <button
              className="btn !px-2.5"
              onClick={() => { setPlaying(false); setIndex(Math.max(0, index - 1)); }}
              title="Lùi một nước"
            >
              ◀
            </button>
            <button className="btn btn-primary !px-4" onClick={() => setPlaying(!playing)}>
              {playing ? 'Dừng' : index >= total ? 'Phát lại' : 'Phát'}
            </button>
            <button
              className="btn !px-2.5"
              onClick={() => { setPlaying(false); setIndex(Math.min(total, index + 1)); }}
              title="Tới một nước"
            >
              ▶
            </button>
            <button className="btn !px-2.5" onClick={() => { setPlaying(false); setIndex(total); }} title="Về cuối">
              ⏭
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-[13px]">
            <div className="flex items-center gap-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  className={`btn !px-2 !py-0.5 !text-[12px] ${speed === s ? '!border-cube-blue !text-cube-blue' : ''}`}
                  onClick={() => setSpeed(s)}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px] text-ink-300">
            <input type="checkbox" checked={pauseAtSteps} onChange={(e) => setPauseAtSteps(e.target.checked)} />
            Tự dừng ở cuối mỗi bước
          </label>
        </section>

        <div className="flex flex-col gap-5">
          <section className="panel p-4">
            <StepRibbon
              steps={analysis.steps}
              totalMs={analysis.totalMs}
              height={16}
              showLabels
              activeKey={currentStep?.key ?? null}
              onSelect={jumpToStep}
            />
            <p className={`mt-3 text-sm ${v.tone === 'good' ? 'text-good' : v.tone === 'bad' ? 'text-bad' : 'text-warn'}`}>
              {v.text}
            </p>
          </section>

          {/* Từng nước một, độ rộng tỉ lệ với thời gian thật */}
          <section className="panel p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Từng nước</h2>
              <span className="text-[13px] text-ink-400">
                Ô càng rộng là càng lâu · vệt đỏ là chỗ dừng tay quá {Math.round(analysis.pauseThresholdMs)}ms
              </span>
            </div>
            <MoveTape analysis={analysis} index={index} onSeek={(i) => { setPlaying(false); setIndex(i); }} />
          </section>

          <section className="panel overflow-hidden">
            <table className="data">
              <thead>
                <tr>
                  <th>Bước</th>
                  <th className="text-right">Thời gian</th>
                  <th className="text-right">%</th>
                  <th className="text-right">Nước</th>
                  <th className="text-right">TPS</th>
                  <th className="text-right">Dừng</th>
                </tr>
              </thead>
              <tbody>
                {analysis.steps.map((s) => (
                  <tr key={s.key} className="cursor-pointer" onClick={() => jumpToStep(s.key)}>
                    <td>
                      <span className="mr-2 inline-block size-2 rounded-[2px]" style={{ background: stepColor(s.key) }} />
                      {s.label}
                      {!s.detected && <span className="ml-2 text-[12px] text-ink-500">không nhận ra</span>}
                    </td>
                    <td className="tnum text-right font-mono">{formatSeconds(s.durationMs)}</td>
                    <td className="tnum text-right text-ink-400">
                      {Math.round((s.durationMs / analysis.totalMs) * 100)}%
                    </td>
                    <td className="tnum text-right">{s.moveCount}</td>
                    <td className="tnum text-right">{s.tps.toFixed(1)}</td>
                    <td className="tnum text-right">
                      {s.pauses.length ? (
                        <span className="text-warn">
                          {s.pauses.length} · {formatSeconds(s.pauseMs)}s
                        </span>
                      ) : (
                        <span className="text-ink-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}

function MoveTape({
  analysis,
  index,
  onSeek,
}: {
  analysis: NonNullable<ReturnType<typeof analyzeSolveRecord>>;
  index: number;
  onSeek: (i: number) => void;
}) {
  const deltas = analysis.moves.map((m, i) => (i === 0 ? 0 : m.t - analysis.moves[i - 1].t));
  const maxDelta = Math.max(1, ...deltas);
  const stepOf = (i: number) => analysis.steps.find((s) => i > s.startIndex && i <= s.endIndex);

  return (
    <div className="flex flex-wrap gap-1">
      {analysis.moves.map((m, i) => {
        const step = stepOf(i + 1);
        const d = deltas[i];
        const isPause = d > analysis.pauseThresholdMs;
        const active = index === i + 1;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSeek(i + 1)}
            title={`${m.move} · +${Math.round(d)}ms`}
            className="relative flex flex-col items-center rounded-[3px] border px-1.5 py-1 font-mono text-[13px] transition-colors"
            style={{
              borderColor: active ? stepColor(step?.key ?? '') : 'var(--color-ink-700)',
              background: active ? 'color-mix(in srgb, ' + stepColor(step?.key ?? '') + ' 22%, transparent)' : 'transparent',
              color: isPause ? 'var(--color-bad)' : 'var(--color-ink-100)',
            }}
          >
            <span>{m.move}</span>
            <span
              className="mt-1 block rounded-[1px]"
              style={{
                width: `${Math.max(3, (d / maxDelta) * 26)}px`,
                height: '3px',
                background: isPause ? 'var(--color-bad)' : stepColor(step?.key ?? ''),
                opacity: isPause ? 1 : 0.75,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
