import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/app';
import { db, type Solve } from '../store/db';
import { parseAlg } from '../cube/alg';
import { analyzeSolveRecord, analyzeMany } from '../analysis/pipeline';
import { buildMoveBaseline, reviewSolve, VERDICT_COLORS, type MoveRating, type SolveReview } from '../analysis/moveReview';
import { stepFacelets } from '../analysis/method';
import { effectiveTime, formatSeconds, formatTime } from '../analysis/stats';
import CubeView from '../components/CubeView';
import StepRibbon from '../components/StepRibbon';
import ScrambleDisplay from '../components/ScrambleDisplay';
import { stepColor } from '../components/palette';
import { verdict } from '../components/PostSolve';

const SPEEDS = [0.25, 0.5, 1, 2];

export default function ReplayPage({ solveId, onBack }: { solveId: number; onBack: () => void }) {
  const { settings } = useApp();
  const [solve, setSolve] = useState<Solve | null>(null);
  const [corpus, setCorpus] = useState<Solve[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [pauseAtSteps, setPauseAtSteps] = useState(true);
  const [viewMode, setViewMode] = useState<'3d' | 'net' | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    void db.solves.get(solveId).then((s) => {
      setSolve(s ?? null);
      setIndex(0);
    });
  }, [solveId]);

  // Mốc so sánh lấy từ lịch sử của chính người dùng. Giới hạn 150 solve gần nhất
  // cho vừa phải, và cũng để phản ánh phong độ hiện tại chứ không phải hồi mới tập.
  useEffect(() => {
    void db.solves.orderBy('date').reverse().limit(150).toArray().then(setCorpus);
  }, []);

  const analysis = useMemo(() => (solve ? analyzeSolveRecord(solve, settings) : null), [solve, settings]);
  const baseline = useMemo(() => buildMoveBaseline(analyzeMany(corpus, settings)), [corpus, settings]);
  const review = useMemo(() => (analysis ? reviewSolve(analysis, baseline) : null), [analysis, baseline]);
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

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Khối + điều khiển phát lại */}
        <section className="panel p-4">
          <div className="flex justify-center">
            <CubeView
              state={state}
              viewRotation={viewRotation}
              highlight={highlight}
              size={240}
              force={viewMode ?? undefined}
              interactive
            />
          </div>
          <div className="mt-2 flex justify-center gap-1">
            <button
              className={`btn !px-2 !py-0.5 !text-[12px] ${viewMode === '3d' ? '!border-cube-blue !text-cube-blue' : ''}`}
              onClick={() => setViewMode('3d')}
            >
              3D
            </button>
            <button
              className={`btn !px-2 !py-0.5 !text-[12px] ${viewMode === 'net' ? '!border-cube-blue !text-cube-blue' : ''}`}
              onClick={() => setViewMode('net')}
              title="Trải phẳng — thấy đủ cả 6 mặt cùng lúc"
            >
              Trải phẳng
            </button>
          </div>
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

        <div className="flex min-w-0 flex-col gap-5">
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

          {review && (
            <MoveReviewPanel
              review={review}
              current={review.ratings.find((r) => r.index === index) ?? null}
              onJump={(i) => {
                setPlaying(false);
                setIndex(i);
              }}
            />
          )}

          {/* Từng nước một, độ rộng tỉ lệ với thời gian thật */}
          <section className="panel p-4">
            <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 className="shrink-0 text-sm font-semibold">Từng nước</h2>
              <span className="flex flex-wrap items-center gap-3 text-[12px] text-ink-400">
                <span>Vệt dưới mỗi nước dài theo thời gian, màu theo nhanh/chậm so với chính bạn</span>
                {(['rất nhanh', 'bình thường', 'chậm', 'đứng hình'] as const).map((v) => (
                  <span key={v} className="flex items-center gap-1">
                    <span className="inline-block h-[3px] w-3 rounded-[1px]" style={{ background: VERDICT_COLORS[v] }} />
                    {v}
                  </span>
                ))}
              </span>
            </div>
            <MoveTape
              analysis={analysis}
              review={review}
              index={index}
              onSeek={(i) => {
                setPlaying(false);
                setIndex(i);
              }}
            />
          </section>

          <section className="panel overflow-x-auto">
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
  review,
  index,
  onSeek,
}: {
  analysis: NonNullable<ReturnType<typeof analyzeSolveRecord>>;
  review: SolveReview | null;
  index: number;
  onSeek: (i: number) => void;
}) {
  const deltas = analysis.moves.map((m, i) => (i === 0 ? 0 : m.t - analysis.moves[i - 1].t));
  const maxDelta = Math.max(1, ...deltas);
  const stepOf = (i: number) => analysis.steps.find((s) => i > s.startIndex && i <= s.endIndex);
  const ratingOf = (i: number) => review?.ratings.find((r) => r.index === i) ?? null;

  return (
    <div className="flex flex-wrap gap-1">
      {analysis.moves.map((m, i) => {
        const step = stepOf(i + 1);
        const d = deltas[i];
        const rating = ratingOf(i);
        const color = rating ? VERDICT_COLORS[rating.verdict] : stepColor(step?.key ?? '');
        const active = index === i + 1;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSeek(i + 1)}
            title={
              rating
                ? `${m.move} · ${Math.round(d)}ms · ${rating.verdict} (thường ${Math.round(rating.baselineMs)}ms, mốc theo ${rating.basis})`
                : `${m.move} · ${Math.round(d)}ms`
            }
            className="relative flex flex-col items-center rounded-[3px] border px-1.5 py-1 font-mono text-[13px] transition-colors"
            style={{
              borderColor: active ? stepColor(step?.key ?? '') : 'var(--color-ink-700)',
              background: active ? 'color-mix(in srgb, ' + stepColor(step?.key ?? '') + ' 22%, transparent)' : 'transparent',
              color: rating && rating.verdict !== 'bình thường' ? color : 'var(--color-ink-100)',
            }}
          >
            <span>{m.move}</span>
            <span
              className="mt-1 block rounded-[1px]"
              style={{
                width: Math.max(3, (d / maxDelta) * 26) + 'px',
                height: '3px',
                background: color,
                opacity: rating?.verdict === 'bình thường' ? 0.5 : 1,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Bảng đánh giá kiểu xem lại ván cờ, nhưng thang đo là nhanh/chậm. */
function MoveReviewPanel({
  review,
  current,
  onJump,
}: {
  review: SolveReview;
  current: MoveRating | null;
  onJump: (index: number) => void;
}) {
  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Đánh giá từng nước</h2>
        <span className="text-[13px] text-ink-400">
          so với tốc độ thường ngày của bạn, dựng từ {review.baselineSolves} solve
        </span>
      </div>

      {!review.reliable && (
        <p className="mt-2 text-[13px] text-warn">
          Còn ít dữ liệu nên mốc so sánh chưa chắc. Giải thêm vài chục lần nữa thì phần này mới đáng tin.
        </p>
      )}

      {review.lostMs > 250 ? (
        <p className="mt-3 max-w-[68ch] text-sm text-ink-200">
          <span className="tnum font-mono text-lg text-bad">{formatSeconds(review.lostMs)}s</span> mất thêm ở{' '}
          {review.slowest.length} nước chậm bất thường. Nếu những nước đó chạy bằng tốc độ thường ngày của bạn
          thì solve này còn <span className="tnum font-mono text-good">{formatSeconds(review.potentialMs)}s</span>.
        </p>
      ) : (
        <p className="mt-3 text-sm text-good">
          Không có nước nào khựng bất thường — cả bài chạy đều theo đúng nhịp thường ngày của bạn.
        </p>
      )}

      {review.slowest.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {review.slowest.map((r) => (
            <li key={r.index}>
              <button
                type="button"
                onClick={() => onJump(r.index)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 rounded-[4px] px-2 py-1 text-left hover:bg-ink-800"
              >
                <span className="tnum w-7 shrink-0 text-[12px] text-ink-500">#{r.index}</span>
                <span className="w-[5.5rem] shrink-0 font-mono text-[13px]">
                  {r.prevMove} <span className="text-ink-500">→</span> {r.move}
                </span>
                <span className="tnum w-16 shrink-0 font-mono text-[13px]" style={{ color: VERDICT_COLORS[r.verdict] }}>
                  {Math.round(r.deltaMs)}ms
                </span>
                <span className="tnum shrink-0 text-[12px] text-ink-400">thường {Math.round(r.baselineMs)}ms</span>
                <span className="hidden min-w-0 flex-1 truncate text-[12px] text-ink-400 sm:block">{r.stepLabel}</span>
                <span className="shrink-0 text-[12px]" style={{ color: VERDICT_COLORS[r.verdict] }}>
                  {r.verdict}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {current && (
        <p className="mt-3 border-t border-ink-700 pt-3 text-[13px] text-ink-300">
          Nước đang xem:{' '}
          <span className="font-mono text-ink-100">
            {current.prevMove} → {current.move}
          </span>{' '}
          mất <span className="tnum font-mono">{Math.round(current.deltaMs)}ms</span>, bạn thường mất{' '}
          <span className="tnum font-mono">{Math.round(current.baselineMs)}ms</span> —{' '}
          <span style={{ color: VERDICT_COLORS[current.verdict] }}>{current.verdict}</span>{' '}
          <span className="text-ink-500">(mốc theo {current.basis})</span>
        </p>
      )}
    </section>
  );
}
