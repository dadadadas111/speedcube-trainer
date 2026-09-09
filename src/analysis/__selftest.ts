import { SOLVED_STATE, applyMoves, applyPerm, stateSequence, isSolved, PIECES, groupSolved, canonicalKey } from '../cube/cube';
import { ROTATIONS } from '../cube/geometry';
import { invertAlg } from '../cube/alg';
import { simulateSensorStream } from '../cube/sensorSim';
import { detectStages, ROUX_STAGES, rouxEdgesOriented } from './method';

let fails = 0;
const check = (name: string, cond: boolean, extra = '') => {
  if (!cond) { fails++; console.log('FAIL ' + name + (extra ? '  <' + extra + '>' : '')); }
  else console.log('ok   ' + name);
};
const anyRot = (s: Uint8Array, f: (s: Uint8Array, r: Uint8Array) => boolean) => ROTATIONS.some(r => f(s, r));

/* ---- Dựng ngược một solve Roux hợp lệ, mỗi bước chỉ dùng nhóm nước bảo toàn bước trước ---- */
const FB   = ['D', 'L', "F'", 'B2', "D'"];
const SB   = ['R', 'U', "R'", 'M', 'U', "M'", 'r', 'U', "r'"];
const CMLL = ['R', 'U', "R'", 'U', 'R', 'U2', "R'"];   // Sune: chỉ đụng góc U + cạnh U
const EO   = ['U', 'M', "U'", "M'"];
const LR   = ['U', 'M2', "U'"];
const L4C  = ['M2'];
const SOLUTION = [...FB, ...SB, ...CMLL, ...EO, ...LR, ...L4C];
const start = applyMoves(SOLVED_STATE, invertAlg(SOLUTION));
const states = stateSequence(start, SOLUTION);

const B = { FB: FB.length, SB: 0, CMLL: 0, EO: 0, LR: 0, L4C: 0 };
B.SB = B.FB + SB.length; B.CMLL = B.SB + CMLL.length; B.EO = B.CMLL + EO.length;
B.LR = B.EO + LR.length; B.L4C = B.LR + L4C.length;

check('solve kết thúc ở trạng thái đã giải', isSolved(states[states.length - 1]));
check('CMLL (Sune) không phá hai khối',
  anyRot(states[B.CMLL], (s, r) => groupSolved(s, r, PIECES.FB) && groupSolved(s, r, PIECES.SB)));

const det = detectStages(states, ROUX_STAGES);
const got = Object.fromEntries(det.map(d => [d.key, d.endIndex])) as Record<string, number>;
console.log('  mong đợi :', B);
console.log('  phát hiện:', got);
for (const k of Object.keys(B) as (keyof typeof B)[]) {
  // EO có thể xong sớm hơn nước cuối của bước 4a: nếu chỉ còn lát M lệch 90 độ
  // thì các cạnh đã đúng chiều rồi, phần còn lại thuộc về 4c.
  // 4b có thể xong sớm hơn nước cuối của bước: nước U cuối cùng chỉ là AUF,
  // hai cạnh UL/UR đã vào đúng chỗ từ trước đó rồi.
  if (k === 'LR') check('phát hiện 4b không muộn hơn lúc dựng', got[k] <= B[k] && got[k] > B.EO, `${got[k]} vs ${B[k]}`);
  else check(`phát hiện ${k}`, got[k] === B[k], `${got[k]}`);
}

// Tiêu chí EO: phải bất biến dưới đúng nhóm nước của bước 4b là ⟨M2, U⟩
{
  const oriented = rouxEdgesOriented;
  const ID = ROTATIONS.find((r) => r.every((v, i) => v === i))!;
  check('EO: khối đã giải là đã đúng chiều', oriented(SOLVED_STATE, ID));
  // Điều kiện chiều cạnh phải bất biến dưới nhóm của bước 4b, nếu không thì
  // làm 4b sẽ phá EO — vô lý với thứ tự các bước của Roux.
  const g4b = ['U', "U'", 'U2', 'M2', 'U M2', "M2 U' M2", "M2 U2 M2 U'", 'U M2 U2 M2 U'];
  const broken = g4b.filter((r) => !anyRot(applyMoves(SOLVED_STATE, r.split(' ')), oriented));
  check('EO: bất biến dưới toàn bộ nhóm ⟨M2, U⟩ của bước 4b', broken.length === 0, broken.join(' | '));
  check('EO: một nước M làm hỏng (lát giữa lệch 90 độ)', !anyRot(applyMoves(SOLVED_STATE, ['M']), oriented));
  check('EO: trạng thái nửa đúng nửa sai bị loại', !anyRot(applyMoves(SOLVED_STATE, ['M', 'U', "M'", "U'"]), oriented));
  // Và phải KHÔNG bất biến dưới nước M đơn lẻ — đó chính là lý do bước 4a tồn tại
  check('EO: có thể bị phá bởi chuỗi M/U bất kỳ',
    ["M U M' U'", "M' U2 M U", 'M U2 M'].some((r) => !anyRot(applyMoves(SOLVED_STATE, r.split(' ')), oriented)));
}

check('đơn điệu', det.every((d, i) => i === 0 || d.endIndex >= det[i - 1].endIndex));
check('EO chưa xong ngay sau CMLL', !anyRot(states[B.CMLL], ROUX_STAGES[3].test));
check('4b chưa xong ngay sau EO', !anyRot(states[B.EO], ROUX_STAGES[4].test));

/* ---- Bất biến với hướng cầm khối THAY ĐỔI THEO THỜI GIAN ----
   Đây chính là điều kiện mà thiết kế phụ thuộc vào: mỗi trạng thái được kiểm tra
   độc lập trên cả 24 hướng, nên hệ quy chiếu lệch dần cũng không ảnh hưởng. */
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const wobbled = states.map((s) => applyPerm(s, ROTATIONS[Math.floor(rnd() * 24)]));
const detW = detectStages(wobbled, ROUX_STAGES);
check('bất biến khi mỗi trạng thái bị quay một kiểu khác nhau',
  detW.every((d, i) => d.endIndex === det[i].endIndex), JSON.stringify(detW.map(d => d.endIndex)));

/* ---- Mô phỏng đúng cách cảm biến GAN báo về ----
   Cảm biến chỉ thấy vòng quay của 6 mặt so với LÕI. Nước lát cắt/nước rộng làm
   lõi quay, nên các nước sau đó bị đổi hệ quy chiếu theo. */
const reported = simulateSensorStream(SOLUTION);
check('solve mẫu có nước r và nước M', SOLUTION.some(m => m[0] === 'r') && SOLUTION.some(m => m[0] === 'M'));
check('dòng nước cảm biến chỉ gồm nước mặt', reported.every(m => 'URFDLB'.includes(m[0])));

const statesR = stateSequence(start, reported);
check('dòng nước cảm biến vẫn kết thúc ở trạng thái đã giải', isSolved(statesR[statesR.length - 1]));
check('trạng thái cuối trùng thực tế sai khác đúng một phép quay',
  canonicalKey(statesR[statesR.length - 1]) === canonicalKey(states[states.length - 1]));

const detR = detectStages(statesR, ROUX_STAGES);
// M bị tách thành 2 sự kiện nên chỉ số nước dịch đi; so sánh theo số nước M đứng trước
const mBefore = (idx: number) => SOLUTION.slice(0, idx).filter(m => 'MES'.includes(m[0])).length;
console.log('  cảm biến :', detR.map(d => d.endIndex).join(','));
check('biên bước khớp sau khi quy đổi số sự kiện',
  det.every((d, i) => detR[i].endIndex === d.endIndex + mBefore(d.endIndex)),
  JSON.stringify(det.map(d => d.endIndex + mBefore(d.endIndex))));

console.log(fails === 0 ? '\nTẤT CẢ ĐỀU PASS' : `\n${fails} TEST LỖI`);

/* ---- Bộ khung có AUF: dùng cho các bước LSE, nơi lớp U xoay liên tục ---- */
{
  const { ROTATIONS_WITH_AUF } = await import('./method');
  const cmll = ROUX_STAGES[2].test;
  const anyStrict = (s: Uint8Array) => ROTATIONS.some((r) => cmll(s, r));
  const anyAuf = (s: Uint8Array) => ROTATIONS_WITH_AUF.some((r) => cmll(s, r));

  check('bộ khung AUF gồm 96 hoán vị', ROTATIONS_WITH_AUF.length === 96, String(ROTATIONS_WITH_AUF.length));
  check('khối đã giải: cả hai bộ đều thấy góc đã xong', anyStrict(SOLVED_STATE) && anyAuf(SOLVED_STATE));

  // Xoay lớp U của khối đã giải: góc vẫn "xong theo nghĩa CMLL", chỉ là chưa AUF
  for (const u of ['U', "U'", 'U2']) {
    const s = applyMoves(SOLVED_STATE, [u]);
    check(`sau ${u}: bộ chặt coi là CHƯA xong góc`, !anyStrict(s));
    check(`sau ${u}: bộ có AUF coi là đã xong góc`, anyAuf(s));
  }
  // Nhưng xoay một mặt khác thì phá góc thật, cả hai bộ đều phải thấy
  check('sau R: cả hai bộ đều thấy góc chưa xong', !anyStrict(applyMoves(SOLVED_STATE, ['R'])) && !anyAuf(applyMoves(SOLVED_STATE, ['R'])));
  // Bộ có AUF không được nới lỏng phần hai khối
  check('bộ có AUF vẫn bắt buộc hai khối phải xong', !anyAuf(applyMoves(SOLVED_STATE, ['D'])));
}
