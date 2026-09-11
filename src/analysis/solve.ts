/** Breaking a solve into steps, with TPS, pauses and weak spots. */

import { SOLVED_STATE, applyMoves, stateSequence, isSolved, type CubeState } from '../cube/cube';
import type { TimedMove } from '../cube/moveStream';
import { scanStages, stagesFor, guessMethod, type MethodName, type StageDetection } from './method';

export interface PauseInfo {
  /** The pause happened immediately BEFORE move number moveIndex */
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
  /** Orientation detected at the end of the step, used for rendering */
  rotation: Uint8Array | null;
  /** The same without any AUF: the way the cube was being held during the step */
  frame: Uint8Array | null;
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
  /** Fraction of the solve spent not turning */
  pauseRatio: number;
  longestPause: PauseInfo | null;
  /** The pause threshold actually used (ms) */
  pauseThresholdMs: number;
  complete: boolean;
  warning: string | null;
  /**
   * The colour scheme the solve was read in. The solver picks their own block
   * colours, so this is whichever of the 24 relabellings made the steps line up
   * — the replay needs it to highlight the right pieces.
   */
  colors: Uint8Array;
}

export interface AnalyzeOptions {
  method?: MethodName | 'auto';
  /** A pause is a gap between moves longer than this */
  minPauseMs?: number;
  /** ...and longer than this multiple of the solve's own median gap */
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
  const { detections, colors } = scanStages(states, stagesFor(method));

  // Gaps between moves; the first is measured from 0 (the timer starts on move one)
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
      frame: d.frame,
      detected,
    });
    cursor = endIndex;
    cursorMs = endMs;
  }

  // Time after the last move (letting go, stopping the timer) goes to the last step
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
    colors,
    warning: !complete
      ? 'The move stream does not end solved — bluetooth may have dropped some moves.'
      : undetected.length
        ? `Steps not recognised: ${undetected.join(', ')}. You may be using a variant of the method.`
        : null,
  };
}
