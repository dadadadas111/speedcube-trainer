import { buildMoveBaseline, reviewSolve } from './moveReview';
import type { SolveAnalysis } from './solve';
import type { StepAnalysis } from './solve';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

/** Dựng một SolveAnalysis tối giản từ danh sách (nước, khoảng cách tới nước trước). */
function fakeSolve(pairs: [string, number][], stepKey = 'SB'): SolveAnalysis {
  let t = 0;
  const moves = pairs.map(([move, d]) => ({ move, t: (t += d) }));
  const step: StepAnalysis = {
    key: stepKey, label: stepKey, hint: '', startIndex: 0, endIndex: moves.length,
    startMs: 0, endMs: t, durationMs: t, moveCount: moves.length, tps: 0,
    pauses: [], pauseMs: 0, rotation: null, detected: true,
  };
  return {
    method: 'roux', steps: [step], states: [], moves, totalMs: t,
    totalMoves: moves.length, tps: 0, pauseMs: 0, pauseRatio: 0,
    longestPause: null, pauseThresholdMs: 250, complete: true, warning: null,
  };
}

/** 20 solve "bình thường", mỗi solve 20 nước: R->U luôn 100ms, U->R luôn 300ms. */
const pattern: [string, number][] = [['R', 0]];
for (let i = 0; i < 10; i++) pattern.push(['U', 100], ['R', 300]);
const corpus = Array.from({ length: 20 }, () => fakeSolve(pattern));
const baseline = buildMoveBaseline(corpus);

check('mốc học được cặp nước R->U', baseline.transition.get('R>U') === 100, String(baseline.transition.get('R>U')));
check('mốc học được cặp nước U->R', baseline.transition.get('U>R') === 300, String(baseline.transition.get('U>R')));
check('mốc chung là trung vị của tất cả khoảng cách', baseline.overall === 200, String(baseline.overall));
check('gom đủ mẫu để coi là đáng tin', baseline.samples >= 300, String(baseline.samples));
check('đếm đúng số solve', baseline.solves === 20);

// Điểm mấu chốt: 250ms là NHANH cho U->R nhưng CHẬM cho R->U.
// Nếu chỉ so với một con số chung thì không phân biệt được chuyện này.
{
  const s = fakeSolve([['R', 0], ['U', 200], ['R', 200], ['U', 100]]);
  const r = reviewSolve(s, baseline);
  const rUtoR = r.ratings.find((x) => x.prevMove === 'R' && x.move === 'U')!;
  const rRtoU = r.ratings.find((x) => x.prevMove === 'U' && x.move === 'R')!;
  check('cùng 200ms: sau R thì bị coi là chậm', rUtoR.verdict === 'chậm', `${rUtoR.verdict} ratio=${rUtoR.ratio.toFixed(2)}`);
  check('cùng 200ms: sau U lại là nhanh', rRtoU.verdict === 'nhanh', `${rRtoU.verdict} ratio=${rRtoU.ratio.toFixed(2)}`);
  check('dùng mốc cặp nước', rUtoR.basis === 'cặp nước' && rRtoU.basis === 'cặp nước');
}

// Đứng hình hẳn thì phải bị chỉ mặt, và tính đúng thời gian mất thêm
{
  const s = fakeSolve([['R', 0], ['U', 100], ['R', 300], ['U', 1600], ['R', 300], ['U', 100]]);
  const r = reviewSolve(s, baseline);
  const stuck = r.ratings.find((x) => x.deltaMs === 1600)!;
  check('nước đứng hình bị gắn cờ', stuck.verdict === 'đứng hình', `${stuck.verdict} ratio=${stuck.ratio}`);
  check('mất thêm = thời gian thật trừ mốc', Math.round(r.lostMs) === 1500, String(r.lostMs));
  check('thời gian tiềm năng = tổng trừ phần mất', Math.round(r.potentialMs) === Math.round(s.totalMs - 1500));
  check('nước chậm nhất đứng đầu danh sách', r.slowest[0] === stuck);
  check('các nước bình thường không tính mất thời gian',
    r.ratings.filter((x) => x !== stuck).every((x) => x.lostMs === 0));
}

// Nhanh hơn thường ngày thì không bị tính là "mất", và được ghi nhận
{
  const s = fakeSolve([['R', 0], ['U', 50], ['R', 150], ['U', 50]]);
  const r = reviewSolve(s, baseline);
  check('nhanh hơn mốc -> không mất thời gian', r.lostMs === 0);
  check('có ghi nhận nước nhanh', r.fastest.length > 0 && r.fastest[0].ratio < 0.9);
  check('tiềm năng bằng đúng thời gian thật', r.potentialMs === s.totalMs);
}

// Cặp nước chưa từng gặp thì phải tụt xuống mốc thô hơn chứ không được vỡ
{
  const s = fakeSolve([['F', 0], ['B2', 400]]);
  const r = reviewSolve(s, baseline);
  check('cặp lạ vẫn chấm được', r.ratings.length === 1);
  check('và ghi rõ là dùng mốc thô hơn', r.ratings[0].basis !== 'cặp nước', r.ratings[0].basis);
}

// Chưa có lịch sử thì lấy chính solve đó làm mốc, không được ném lỗi
{
  const empty = buildMoveBaseline([]);
  const s = fakeSolve([['R', 0], ['U', 100], ['R', 100], ['U', 900]]);
  const r = reviewSolve(s, empty);
  check('không có lịch sử vẫn chạy', r.ratings.length === 3);
  check('và tự đánh dấu là chưa đáng tin', !r.reliable);
  check('vẫn chỉ ra được nước lệch hẳn so với phần còn lại',
    r.ratings[2].verdict === 'đứng hình' || r.ratings[2].verdict === 'chậm', r.ratings[2].verdict);
  check('đủ lịch sử thì mới coi là đáng tin', reviewSolve(s, baseline).reliable);
}

// Khoảng cách vô lý (rớt bluetooth) không được làm hỏng mốc
{
  const dirty = [...corpus, fakeSolve([['R', 0], ['U', 30000], ['R', 300]])];
  const b2 = buildMoveBaseline(dirty);
  check('bỏ qua khoảng cách vô lý khi dựng mốc', b2.transition.get('R>U') === 100, String(b2.transition.get('R>U')));
}

console.log(fails === 0 ? '\nTẤT CẢ ĐỀU PASS' : `\n${fails} TEST LỖI`);
