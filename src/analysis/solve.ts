/** Bóc tách một solve thành các bước, tính TPS, quãng dừng và điểm yếu. */

import { SOLVED_STATE, applyMoves, stateSequence, isSolved, type CubeState } from '../cube/cube';
import type { TimedMove } from '../cube/moveStream';
import { detectStages, stagesFor, guessMethod, type MethodName, type StageDetection } from './method';

export interface PauseInfo {
  /** Dừng xảy ra ngay TRƯỚC nước thứ moveIndex */
  moveIndex: number;
  ms: number;
}

export interface StepAnalysis {
  key: string;
  label: string;
  hint: string;
  startIndex: number;
  endIndex: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  moveCount: number;
  tps: number;
  pauses: PauseInfo[];
  pauseMs: number;
  /** Hướng cầm khối phát hiện được ở cuối bước (để vẽ minh hoạ) */
  rotation: Uint8Array | null;
  detected: boolean;
}

export interface SolveAnalysis {
  method: MethodName;
  steps: StepAnalysis[];
  states: CubeState[];
  moves: TimedMove[];
  totalMs: number;
  totalMoves: number;
  tps: number;
  pauseMs: number;
  /** Tỷ lệ thời gian không quay tay */
  pauseRatio: number;
  longestPause: PauseInfo | null;
  /** Ngưỡng dừng thực tế đã dùng (ms) */
  pauseThresholdMs: number;
  complete: boolean;
  warning: string | null;
}

export interface AnalyzeOptions {
  method?: MethodName | 'auto';
  /** Dừng = khoảng cách giữa hai nước vượt ngưỡng này */
  minPauseMs?: number;
  /** ...và vượt bội số này so với khoảng cách trung vị của chính solve đó */
  pauseFactor?: number;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function analyzeSolve(
  scramble: string[],
  moves: TimedMove[],
  totalMs: number,
  opts: AnalyzeOptions = {},
): SolveAnalysis {
  const minPause = opts.minPauseMs ?? 180;
  const factor = opts.pauseFactor ?? 2.2;

  const start = applyMoves(SOLVED_STATE, scramble);
  const states = stateSequence(start, moves.map((m) => m.move));
  const method: MethodName = !opts.method || opts.method === 'auto' ? guessMethod(states) : opts.method;
  const detections = detectStages(states, stagesFor(method));

  // Khoảng cách giữa các nước; nước đầu tính từ mốc 0 (đồng hồ chạy từ nước đầu)
  const deltas: number[] = [];
  for (let i = 0; i < moves.length; i++) deltas.push(i === 0 ? 0 : moves[i].t - moves[i - 1].t);
  const med = median(deltas.slice(1).filter((d) => d > 0));
  const threshold = Math.max(minPause, med * factor);

  const steps: StepAnalysis[] = [];
  let cursor = 0;
  let cursorMs = 0;
  for (const d of detections as StageDetection[]) {
    const detected = d.endIndex >= 0;
    const endIndex = detected ? d.endIndex : cursor;
    const endMs = endIndex === 0 ? 0 : (moves[endIndex - 1]?.t ?? cursorMs);
    const pauses: PauseInfo[] = [];
    for (let i = cursor + 1; i <= endIndex; i++) {
      if (deltas[i] > threshold) pauses.push({ moveIndex: i, ms: deltas[i] });
    }
    const durationMs = Math.max(0, endMs - cursorMs);
    const moveCount = endIndex - cursor;
    steps.push({
      key: d.key,
      label: d.label,
      hint: d.hint,
      startIndex: cursor,
      endIndex,
      startMs: cursorMs,
      endMs,
      durationMs,
      moveCount,
      tps: durationMs > 0 ? (moveCount / durationMs) * 1000 : 0,
      pauses,
      pauseMs: pauses.reduce((a, p) => a + p.ms, 0),
      rotation: d.rotation,
      detected,
    });
    cursor = endIndex;
    cursorMs = endMs;
  }

  // Thời gian còn lại sau nước cuối (thả tay, bấm dừng) gán vào bước cuối
  const last = steps[steps.length - 1];
  if (last && totalMs > last.endMs) {
    last.endMs = totalMs;
    last.durationMs = Math.max(0, totalMs - last.startMs);
    last.tps = last.durationMs > 0 ? (last.moveCount / last.durationMs) * 1000 : 0;
  }

  const allPauses = steps.flatMap((s) => s.pauses);
  const pauseMs = allPauses.reduce((a, p) => a + p.ms, 0);
  const complete = isSolved(states[states.length - 1]);
  const undetected = steps.filter((s) => !s.detected).map((s) => s.label);

  return {
    method,
    steps,
    states,
    moves,
    totalMs,
    totalMoves: moves.length,
    tps: totalMs > 0 ? (moves.length / totalMs) * 1000 : 0,
    pauseMs,
    pauseRatio: totalMs > 0 ? pauseMs / totalMs : 0,
    longestPause: allPauses.length ? allPauses.reduce((a, b) => (b.ms > a.ms ? b : a)) : null,
    pauseThresholdMs: threshold,
    complete,
    warning: !complete
      ? 'Dòng nước không kết thúc ở trạng thái đã giải — có thể bluetooth rớt vài nước.'
      : undetected.length
        ? `Không nhận ra bước: ${undetected.join(', ')}. Có thể bạn dùng biến thể khác của phương pháp.`
        : null,
  };
}
