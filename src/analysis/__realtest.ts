/**
 * Test hồi quy trên một solve Roux THẬT lấy từ cube qua bluetooth.
 *
 * Bộ test dữ liệu giả lập không bắt được lỗi gộp lát cắt, vì trong đó hai nửa
 * của mỗi nước M cách nhau ~250ms nên chưa bao giờ chạm tới đường gộp. Cube thật
 * báo hai nửa cách nhau 6–121ms, và lúc đó lỗi mới lộ: gộp R + L' thành M mà
 * quên vế x' của đồng nhất thức M = R L' x' làm mô hình bị xoay, trong khi mọi
 * nước sau vẫn áp theo hệ cũ — trạng thái hỏng hẳn, không nhận ra bước nào.
 */

import { SOLVED_STATE, applyMoves, isSolved, stateSequence } from '../cube/cube';
import { parseAlg } from '../cube/alg';
import { cleanMoveStream } from '../cube/moveStream';
import { detectStages, ROUX_STAGES } from './method';
import { analyzeSolve } from './solve';
import { REAL_SOLVE, realSolveMoves } from './fixtures/realSolve';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

const scramble = parseAlg(REAL_SOLVE.scramble);
const raw = realSolveMoves();
const start = applyMoves(SOLVED_STATE, scramble);

check('dữ liệu gốc lành lặn: dòng nước thô dẫn tới khối đã giải',
  isSolved(applyMoves(start, raw.map((m) => m.move))));

check('cube thật báo hai nửa nước lát cắt cách nhau dưới 45ms là chuyện hiếm',
  (() => {
    const OPP: Record<string, string> = { R: 'L', L: 'R', U: 'D', D: 'U', F: 'B', B: 'F' };
    const gaps: number[] = [];
    for (let i = 0; i < raw.length - 1; i++)
      if (OPP[raw[i].move[0]] === raw[i + 1].move[0]) gaps.push(raw[i + 1].t - raw[i].t);
    return gaps.some((g) => g > 45);
  })());

// Đây là chỗ lỗi cũ chết: sau khi dọn dòng nước thì trạng thái phải vẫn đúng
// (sai khác nhiều nhất một phép quay toàn khối, nên isSolved vẫn phải đúng).
for (const sliceWindow of [45, 80, 140, 200]) {
  const cleaned = cleanMoveStream(raw, { sliceWindow });
  const end = applyMoves(start, cleaned.map((m) => m.move));
  check(`dọn dòng nước (cửa sổ ${sliceWindow}ms) vẫn giữ đúng trạng thái`, isSolved(end));

  const det = detectStages(stateSequence(start, cleaned.map((m) => m.move)), ROUX_STAGES);
  const idx = det.map((d) => d.endIndex);
  check(`cửa sổ ${sliceWindow}ms: nhận ra đủ sáu bước`, idx.every((i) => i > 0), idx.join(','));
  check(`cửa sổ ${sliceWindow}ms: các bước tách rời nhau chứ không dồn cục`,
    new Set(idx).size === 6, idx.join(','));
  check(`cửa sổ ${sliceWindow}ms: thứ tự bước tăng dần`,
    idx.every((v, i) => i === 0 || v > idx[i - 1]), idx.join(','));
}

// Toàn bộ đường phân tích, đúng như giao diện dùng
{
  const a = analyzeSolve(scramble, cleanMoveStream(raw), REAL_SOLVE.timeMs, { method: 'roux' });
  check('phân tích báo là hoàn chỉnh', a.complete && a.warning === null, a.warning ?? '');
  check('mọi bước đều được nhận ra', a.steps.every((s) => s.detected));
  check('không bước nào dài 0 giây', a.steps.every((s) => s.durationMs > 0), a.steps.map((s) => Math.round(s.durationMs)).join(','));
  check('tổng thời gian các bước bằng thời gian solve',
    Math.abs(a.steps.reduce((x, s) => x + s.durationMs, 0) - REAL_SOLVE.timeMs) < 200,
    String(a.steps.reduce((x, s) => x + s.durationMs, 0)));
  check('số nước cộng lại bằng tổng', a.steps.reduce((x, s) => x + s.moveCount, 0) === a.totalMoves);
  check('TPS nằm trong khoảng hợp lý cho solve 16.5 giây', a.tps > 2 && a.tps < 9, a.tps.toFixed(2));
  console.log('   phân bổ:', a.steps.map((s) => `${s.key} ${(s.durationMs / 1000).toFixed(2)}s/${s.moveCount}n`).join('  '));
}

console.log(fails === 0 ? '\nTẤT CẢ ĐỀU PASS' : `\n${fails} TEST LỖI`);
