import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/app';
import { db, type AlgEntry, type Rep } from '../store/db';
import { SEED_ALGS } from '../data/seedAlgs';
import { formatAlg, invertAlg, isValidAlg, parseAlg } from '../cube/alg';
import { cleanMoveStream } from '../cube/moveStream';
import { SOLVED_STATE, applyMoves, canonicalKey, cloneState, type CubeState } from '../cube/cube';
import { DrillMatcher, caseStateFor, summarizeDrill, type DrillRepData, type MoveStat } from '../analysis/drill';
import { useCubeInput } from '../smartcube/useCubeInput';
import { virtualCube } from '../smartcube/virtual';
import CubeNet from '../components/CubeNet';
import { formatSeconds } from '../analysis/stats';

type Phase = 'setup' | 'armed' | 'running' | 'done';

/** Chỉ nạp thư viện mẫu đúng một lần, kể cả khi effect chạy hai lần ở StrictMode. */
let seeding: Promise<void> | null = null;
function seedOnce(): Promise<void> {
  seeding ??= (async () => {
    const n = await db.algs.count();
    if (n === 0) await db.algs.bulkAdd(SEED_ALGS.map((a) => ({ ...a, createdAt: Date.now() })));
  })();
  return seeding;
}

export default function DrillPage() {
  const { settings, cubeStatus, bump, revision } = useApp();
  const usingCube = cubeStatus === 'connected' || settings.keyboardCube;
  const [algs, setAlgs] = useState<AlgEntry[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reps, setReps] = useState<Rep[]>([]);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    await seedOnce();
    const rows = await db.algs.orderBy('createdAt').toArray();
    setAlgs(rows);
    setSelectedId((cur) => cur ?? rows[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load, revision]);

  useEffect(() => {
    if (selectedId == null) return;
    void db.reps.where('algId').equals(selectedId).sortBy('date').then(setReps);
  }, [selectedId, revision]);

  const selected = algs.find((a) => a.id === selectedId) ?? null;
  const groups = useMemo(() => {
    const m = new Map<string, AlgEntry[]>();
    for (const a of algs) {
      if (!m.has(a.group)) m.set(a.group, []);
      m.get(a.group)!.push(a);
    }
    return [...m.entries()];
  }, [algs]);

  const removeAlg = async (id: number) => {
    await db.reps.where('algId').equals(id).delete();
    await db.algs.delete(id);
    if (selectedId === id) setSelectedId(null);
    bump();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="panel flex max-h-[calc(100vh-8rem)] flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-ink-700 px-3 py-2.5">
          <h2 className="text-sm font-semibold">Thư viện alg</h2>
          <button className="btn btn-ghost !px-2 !py-0.5 !text-[13px]" onClick={() => setAdding(true)}>
            Thêm
          </button>
        </header>
        <div className="overflow-y-auto py-1">
          {groups.map(([group, items]) => (
            <div key={group} className="mb-1">
              <p className="px-3 py-1.5 text-[12px] font-medium text-ink-400">{group}</p>
              {items.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id!)}
                  className={`block w-full px-3 py-1.5 text-left text-[13px] ${
                    selectedId === a.id ? 'bg-ink-700 text-ink-100' : 'text-ink-200 hover:bg-ink-800'
                  }`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <div className="flex flex-col gap-5">
        {adding && <AlgForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void load(); }} usingCube={usingCube} keyboard={settings.keyboardCube} />}
        {selected ? (
          <AlgDetail
            key={selected.id}
            alg={selected}
            reps={reps}
            usingCube={usingCube}
            keyboard={settings.keyboardCube}
            onRepSaved={() => selectedId != null && void db.reps.where('algId').equals(selectedId).sortBy('date').then(setReps)}
            onDelete={() => selected.id && void removeAlg(selected.id)}
          />
        ) : (
          <p className="panel p-6 text-sm text-ink-400">Chọn một alg bên trái, hoặc thêm alg mới.</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function AlgForm({
  onClose,
  onSaved,
  usingCube,
  keyboard,
}: {
  onClose: () => void;
  onSaved: () => void;
  usingCube: boolean;
  keyboard: boolean;
}) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('CMLL');
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const recorded = useRef<{ move: string; t: number }[]>([]);

  useCubeInput(
    {
      onMove: (m) => {
        if (!recording) return;
        recorded.current.push({ move: m.move, t: m.cubeTs ?? m.localTs });
        setText(formatAlg(cleanMoveStream(recorded.current).map((x) => x.move)));
      },
    },
    keyboard,
  );

  const valid = text.trim() !== '' && isValidAlg(text) && name.trim() !== '';

  const save = async () => {
    await db.algs.add({ name: name.trim(), group: group.trim() || 'Khác', alg: formatAlg(parseAlg(text)), createdAt: Date.now() });
    onSaved();
  };

  return (
    <section className="panel p-5">
      <h2 className="text-base font-semibold">Thêm alg</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="alg-name">Tên</label>
          <input id="alg-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: CMLL Sune trái" />
        </div>
        <div>
          <label className="field-label" htmlFor="alg-group">Nhóm</label>
          <input id="alg-group" className="input" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="CMLL / LSE / ..." />
        </div>
      </div>
      <div className="mt-3">
        <label className="field-label" htmlFor="alg-text">Ký hiệu</label>
        <input
          id="alg-text"
          className="input font-mono"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="R U R' U R U2 R'"
        />
        {text.trim() !== '' && !isValidAlg(text) && (
          <p className="mt-1.5 text-[13px] text-bad">Có nước không hiểu được. Dùng ký hiệu chuẩn: R U R' U2 M' r ...</p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" disabled={!valid} onClick={() => void save()}>
          Lưu
        </button>
        <button className="btn" onClick={onClose}>
          Huỷ
        </button>
        {usingCube && (
          <button
            className={`btn ${recording ? '!border-bad !text-bad' : ''}`}
            onClick={() => {
              if (!recording) recorded.current = [];
              setRecording(!recording);
            }}
          >
            {recording ? 'Dừng ghi' : 'Ghi từ cube'}
          </button>
        )}
        {recording && <span className="armed text-[13px] text-bad">Đang ghi — cứ thực hiện alg trên cube</span>}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function AlgDetail({
  alg,
  reps,
  usingCube,
  keyboard,
  onRepSaved,
  onDelete,
}: {
  alg: AlgEntry;
  reps: Rep[];
  usingCube: boolean;
  keyboard: boolean;
  onRepSaved: () => void;
  onDelete: () => void;
}) {
  const moves = useMemo(() => {
    try {
      return parseAlg(alg.alg);
    } catch {
      return [];
    }
  }, [alg.alg]);
  const setupMoves = useMemo(() => invertAlg(moves), [moves]);
  const caseState = useMemo(() => caseStateFor(moves, SOLVED_STATE), [moves]);
  const caseKey = useMemo(() => canonicalKey(caseState), [caseState]);

  const repData: DrillRepData[] = useMemo(
    () => reps.map((r) => ({ date: r.date, recognitionMs: r.recognitionMs, execMs: r.execMs, moveTimes: r.moveTimes, extraMoves: r.extraMoves, success: r.success })),
    [reps],
  );
  const summary = useMemo(() => summarizeDrill(moves, repData), [moves, repData]);

  /* ----- máy trạng thái của một lần drill ----- */
  const [phase, setPhase] = useState<Phase>('setup');
  const [progress, setProgress] = useState(0);
  const [lastRep, setLastRep] = useState<DrillRepData | null>(null);
  const [cubeState, setCubeState] = useState<CubeState>(cloneState(SOLVED_STATE));
  const phaseRef = useRef<Phase>('setup');
  const matcherRef = useRef<DrillMatcher | null>(null);
  const armedAtRef = useRef(0);

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    setPhaseBoth('setup');
    setProgress(0);
    setLastRep(null);
    matcherRef.current = null;
  }, [alg.id]);

  const finishRep = useCallback(
    async (success: boolean, times: (number | null)[], mistakes: number) => {
      const execMs = times[times.length - 1] ?? 0;
      const rep: DrillRepData = {
        date: Date.now(),
        recognitionMs: armedAtRef.current ? matcherRef.current?.startedAt ?? 0 : 0,
        execMs: execMs ?? 0,
        moveTimes: times,
        extraMoves: mistakes,
        success,
      };
      const recognitionMs = matcherRef.current?.startedAt != null ? matcherRef.current.startedAt - armedAtRef.current : 0;
      rep.recognitionMs = Math.max(0, recognitionMs);
      setLastRep(rep);
      setPhaseBoth('done');
      if (alg.id) {
        await db.reps.add({ algId: alg.id, ...rep });
        onRepSaved();
      }
    },
    [alg.id, onRepSaved],
  );

  useCubeInput(
    {
      onState: (s) => {
        setCubeState(s);
        const p = phaseRef.current;
        if ((p === 'setup' || p === 'done') && canonicalKey(s) === caseKey) {
          matcherRef.current = new DrillMatcher(moves, caseState);
          armedAtRef.current = performance.now();
          setProgress(0);
          setPhaseBoth('armed');
        }
      },
      onMove: (m, state) => {
        const p = phaseRef.current;
        if (p !== 'armed' && p !== 'running') return;
        const matcher = matcherRef.current;
        if (!matcher) return;
        if (p === 'armed') setPhaseBoth('running');
        const res = matcher.feed(state, m.cubeTs ?? m.localTs);
        setProgress(res.index);
        if (res.event === 'complete') void finishRep(true, res.moveTimes, matcher.mistakes);
      },
    },
    keyboard,
  );

  return (
    <>
      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[13px] text-ink-400">{alg.group}</p>
            <h2 className="text-xl font-semibold">{alg.name}</h2>
          </div>
          <button className="btn btn-danger !py-1 !text-[13px]" onClick={onDelete}>
            Xoá alg
          </button>
        </div>
        {alg.notes && <p className="mt-2 max-w-[60ch] text-[13px] text-ink-400">{alg.notes}</p>}

        <AlgLine moves={moves} stats={summary.moveStats} progress={phase === 'running' || phase === 'done' ? progress : -1} />

        <div className="mt-5 grid gap-5 md:grid-cols-[190px_minmax(0,1fr)]">
          <div>
            <p className="mb-2 text-[13px] text-ink-400">Trạng thái case</p>
            <CubeNet state={caseState} size={170} />
          </div>
          <div>
            {!usingCube ? (
              <p className="text-sm text-ink-400">
                Drill cần smart cube để đo được từng nước. Kết nối cube ở góc trên, hoặc bật khối ảo bàn phím
                trong Cài đặt để thử.
              </p>
            ) : (
              <DrillStatus
                phase={phase}
                progress={progress}
                total={moves.length}
                setupMoves={setupMoves}
                lastRep={lastRep}
                summary={summary}
                keyboard={keyboard}
                onSetupVirtual={() => virtualCube.setState(applyMoves(SOLVED_STATE, invertAlg(moves)))}
              />
            )}
            {usingCube && (
              <div className="mt-4">
                <p className="mb-1.5 text-[13px] text-ink-400">Khối của bạn</p>
                <CubeNet state={cubeState} size={110} />
              </div>
            )}
          </div>
        </div>
      </section>

      {summary.reps > 0 && <DrillStats summary={summary} />}
    </>
  );
}

/* ------------------------------------------------------------------ */

function DrillStatus({
  phase,
  progress,
  total,
  setupMoves,
  lastRep,
  summary,
  keyboard,
  onSetupVirtual,
}: {
  phase: Phase;
  progress: number;
  total: number;
  setupMoves: string[];
  lastRep: DrillRepData | null;
  summary: ReturnType<typeof summarizeDrill>;
  keyboard: boolean;
  onSetupVirtual: () => void;
}) {
  return (
    <div>
      {phase === 'setup' && (
        <>
          <p className="text-lg font-semibold text-warn">Đưa khối về case</p>
          <p className="mt-1 text-sm text-ink-300">Từ khối đã giải, thực hiện:</p>
          <p className="mt-1.5 font-mono text-[15px] text-ink-100">{setupMoves.join(' ')}</p>
          {keyboard && (
            <button className="btn mt-3 !py-1 !text-[13px]" onClick={onSetupVirtual}>
              Đặt khối ảo về case
            </button>
          )}
        </>
      )}
      {phase === 'armed' && (
        <>
          <p className="armed text-lg font-semibold text-good">Sẵn sàng — nước đầu tiên bắt đầu tính giờ</p>
          <p className="mt-1 text-sm text-ink-300">
            Thời gian từ giờ đến nước đầu tiên được tính là thời gian nhận dạng.
          </p>
        </>
      )}
      {phase === 'running' && (
        <>
          <p className="text-lg font-semibold text-cube-blue">
            Đang chạy — nước {progress}/{total}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
            <div className="h-full bg-cube-blue transition-[width]" style={{ width: `${(progress / total) * 100}%` }} />
          </div>
        </>
      )}
      {phase === 'done' && lastRep && (
        <>
          <p className="text-lg font-semibold text-good">
            Xong — {formatSeconds(lastRep.execMs)}s
            {isFinite(summary.bestExecMs) && lastRep.execMs <= summary.bestExecMs && (
              <span className="ml-2 text-warn">kỷ lục mới</span>
            )}
          </p>
          <p className="mt-1 text-sm text-ink-300">
            Nhận dạng {formatSeconds(lastRep.recognitionMs)}s · {(total / (lastRep.execMs / 1000)).toFixed(1)} TPS
            {lastRep.extraMoves > 0 && <span className="text-bad"> · {lastRep.extraMoves} lỗi</span>}
          </p>
          <p className="mt-2 text-sm text-ink-400">Đưa khối về case để làm lần tiếp theo.</p>
          <p className="mt-1 font-mono text-[15px] text-ink-200">{setupMoves.join(' ')}</p>
          {keyboard && (
            <button className="btn mt-3 !py-1 !text-[13px]" onClick={onSetupVirtual}>
              Đặt khối ảo về case
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Alg viết ra, mỗi nước tô màu theo mức hay khựng ở đó. */
function AlgLine({ moves, stats, progress }: { moves: string[]; stats: MoveStat[]; progress: number }) {
  return (
    <div className="mt-4 flex flex-wrap gap-1.5">
      {moves.map((m, i) => {
        const s = stats[i];
        const h = s?.samples >= 2 ? s.hesitation : 0;
        const color = h > 2 ? '#e0384f' : h > 1.5 ? '#ffcf2e' : h > 0 ? '#17b26a' : '#5d6d80';
        const done = progress >= 0 && i < progress;
        const current = progress >= 0 && i === progress;
        return (
          <span
            key={i}
            title={s?.samples ? `${Math.round(s.medianMs)}ms · ${s.samples} lần` : 'chưa có dữ liệu'}
            className="flex flex-col items-center gap-1 rounded-[4px] border px-2 py-1 font-mono text-[15px] transition-colors"
            style={{
              borderColor: current ? '#2f7ff2' : 'var(--color-ink-700)',
              background: current ? 'rgba(47,127,242,.18)' : done ? 'var(--color-ink-800)' : 'transparent',
              color: done ? 'var(--color-ink-400)' : 'var(--color-ink-100)',
            }}
          >
            {m}
            <span className="block h-[3px] w-full rounded-[1px]" style={{ background: color, opacity: h ? 1 : 0.3 }} />
          </span>
        );
      })}
    </div>
  );
}

function DrillStats({ summary }: { summary: ReturnType<typeof summarizeDrill> }) {
  const max = Math.max(
    1,
    summary.medianRecognitionMs || 0,
    ...summary.moveStats.map((s) => s.p75Ms || s.medianMs || 0),
  );
  return (
    <section className="panel p-5">
      <h2 className="text-base font-semibold">Bạn khựng ở đâu</h2>
      <p className="mt-1 max-w-[70ch] text-[13px] text-ink-400">
        Mỗi cột là khoảng thời gian từ nước trước sang nước đó, lấy trung vị qua {summary.reps} lần.
        Cột đỏ là chỗ tay bạn dừng lại nghĩ — thường là chỗ phải đổi cách cầm.
      </p>

      <div className="mt-5 flex items-end gap-1 overflow-x-auto pb-1">
        {/* Nước đầu không có "khoảng cách từ nước trước", nên chỗ đó hiện thời
            gian nhận dạng: từ lúc khối vào case đến khi bạn động tay. */}
        <div className="flex min-w-[54px] flex-col items-center gap-1 border-r border-ink-700 pr-2">
          <span className="tnum font-mono text-[11px] text-ink-400">
            {isNaN(summary.medianRecognitionMs) ? '—' : Math.round(summary.medianRecognitionMs)}
          </span>
          <div className="flex h-[130px] w-full items-end justify-center">
            <div
              className="w-full rounded-t-[3px] bg-ink-400"
              style={{ height: `${Math.min(130, (summary.medianRecognitionMs / max) * 130 || 0)}px`, opacity: 0.7 }}
            />
          </div>
          <span className="text-[12px] text-ink-400">nhận dạng</span>
        </div>
        {summary.moveStats.slice(1).map((s) => {
          const h = s.samples ? (s.medianMs / max) * 130 : 0;
          const color = s.hesitation > 2 ? '#e0384f' : s.hesitation > 1.5 ? '#ffcf2e' : '#17b26a';
          return (
            <div key={s.index} className="flex min-w-[38px] flex-1 flex-col items-center gap-1">
              <span className="tnum font-mono text-[11px] text-ink-400">{s.samples ? Math.round(s.medianMs) : '—'}</span>
              <div className="flex h-[130px] w-full items-end justify-center">
                <div className="w-full rounded-t-[3px]" style={{ height: `${h}px`, background: color, opacity: 0.85 }} />
              </div>
              <span className="font-mono text-[13px]">{s.move}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-ink-700 pt-4 sm:grid-cols-5">
        <Metric label="Số lần" value={String(summary.reps)} />
        <Metric label="Nhanh nhất" value={`${formatSeconds(summary.bestExecMs)}s`} />
        <Metric label="Trung vị" value={`${formatSeconds(summary.medianExecMs)}s`} />
        <Metric label="5 lần gần nhất" value={`${formatSeconds(summary.recentExecMs)}s`} />
        <Metric label="TPS" value={summary.tps.toFixed(1)} />
      </div>

      {summary.worstMoves.length > 0 && (
        <p className="mt-4 max-w-[70ch] text-sm text-warn">
          Chỗ nên tách ra tập riêng:{' '}
          {summary.worstMoves.map((w) => `nước ${w.index + 1} (${w.move}, ${Math.round(w.medianMs)}ms)`).join(', ')}.
          Tập chậm đúng đoạn đó vài chục lần cho tay quen, rồi mới ghép lại cả alg.
        </p>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[13px] text-ink-400">{label}</p>
      <p className="tnum font-mono text-lg">{value}</p>
    </div>
  );
}
