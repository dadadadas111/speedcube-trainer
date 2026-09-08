import { SOLVED_STATE, applyMove, applyMoves, isSolved } from '../cube/cube';
import { parseAlg } from '../cube/alg';
import { simulateSensorStream } from '../cube/sensorSim';
import { DrillMatcher, caseStateFor, summarizeDrill } from './drill';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? ' <' + x + '>' : '')); } else console.log('ok   ' + n); };

// Alg có cả nước rộng r lẫn nước lát M — đúng kiểu Roux
const alg = parseAlg("R U R' U' M' U R U' r'");
const caseState = caseStateFor(alg, SOLVED_STATE);
check('trạng thái case + alg = đã giải', isSolved(applyMoves(caseState, alg)));

// 1. Thực hiện đúng như ký hiệu
{
  const m = new DrillMatcher(alg, caseState);
  let s = caseState, t = 0;
  for (const mv of alg) { s = applyMove(s, mv); t += 200; m.feed(s, t); }
  check('khớp khi thực hiện đúng ký hiệu', m.done && m.mistakes === 0);
}

// 2. Thực hiện như cảm biến báo về: M -> R rồi L', r -> L (kèm lệch hệ quy chiếu)
{
  const reported = simulateSensorStream(alg);
  console.log('     người giải:', alg.join(' '));
  console.log('     cảm biến  :', reported.join(' '));
  const m = new DrillMatcher(alg, caseState);
  let s = caseState, t = 0;
  for (const mv of reported) { s = applyMove(s, mv); t += 150; m.feed(s, t); }
  check('kết thúc ở trạng thái đã giải', isSolved(s));
  check('khớp khi cảm biến tách nước M', m.done, `index sau cùng, lỗi=${m.mistakes}`);
  check('không tính oan lỗi cho nửa nước lát cắt', m.mistakes === 0, String(m.mistakes));
}

// 3. Làm sai rồi sửa lại -> phải bị tính là lỗi
{
  const m = new DrillMatcher(alg, caseState);
  let s = caseState, t = 0;
  for (const mv of ['F', 'D', "D'", "F'"]) { s = applyMove(s, mv); t += 150; m.feed(s, t); }
  check('phát hiện lỗi thật', m.mistakes >= 1, String(m.mistakes));
  for (const mv of alg) { s = applyMove(s, mv); t += 150; m.feed(s, t); }
  check('vẫn hoàn thành được sau khi sửa', m.done);
}

// 4. Thống kê nhiều lần drill: nước số 4 luôn chậm -> phải bị chỉ mặt
{
  const reps = Array.from({ length: 12 }, (_, k) => {
    let t = 0;
    const moveTimes = alg.map((_, i) => (t += i === 4 ? 700 : 160 + (k % 3) * 10));
    return { date: k, recognitionMs: 800, execMs: t, moveTimes, extraMoves: 0, success: true };
  });
  const sum = summarizeDrill(alg, reps);
  check('tổng hợp đủ số lần', sum.reps === 12);
  check('chỉ đúng nước hay khựng', sum.worstMoves[0]?.index === 4, JSON.stringify(sum.worstMoves.map(w => w.index)));
  check('hesitation của nước đó cao', (sum.worstMoves[0]?.hesitation ?? 0) > 3, String(sum.worstMoves[0]?.hesitation));
  check('các nước còn lại không bị gắn cờ', sum.worstMoves.length === 1);
}
console.log(fails === 0 ? '\nTẤT CẢ ĐỀU PASS' : `\n${fails} TEST LỖI`);
