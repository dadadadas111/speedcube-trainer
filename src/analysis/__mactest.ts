import { normalizeMac } from '../smartcube/mac';
import { SOLVED_STATE, isPlausibleState, fromKociemba, applyMoves, cloneState } from '../cube/cube';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

// Nhận mọi kiểu người ta hay gõ MAC
const wanted = 'AB:CD:EF:12:34:56';
for (const input of ['AB:CD:EF:12:34:56', 'ab:cd:ef:12:34:56', 'AB-CD-EF-12-34-56', 'abcdef123456', 'AB CD EF 12 34 56', ' ab:CD-ef 12:34:56 ']) {
  check('nhận dạng MAC: ' + JSON.stringify(input), normalizeMac(input) === wanted, String(normalizeMac(input)));
}
for (const bad of ['', 'AB:CD:EF:12:34', 'AB:CD:EF:12:34:56:78', 'khong-phai-mac', 'GHIJKL123456']) {
  check('từ chối MAC sai: ' + JSON.stringify(bad), normalizeMac(bad) === null, String(normalizeMac(bad)));
}

// Chặn dữ liệu rác do MAC sai
check('khối đã giải là hợp lệ', isPlausibleState(SOLVED_STATE));
check('khối đã xáo vẫn hợp lệ', isPlausibleState(applyMoves(SOLVED_STATE, ['R', 'U', "F'", 'D2'])));
{
  const garbage = cloneState(SOLVED_STATE);
  garbage[0] = 1; // thừa một màu đỏ, thiếu một màu trắng
  check('sai số lượng màu thì bị chặn', !isPlausibleState(garbage));
}
{
  // chuỗi đúng ký tự nhưng số lượng màu loạn — kiểu rác hay gặp khi khoá sai
  const junk = fromKociemba('U'.repeat(54));
  check('chuỗi toàn một màu bị chặn', !isPlausibleState(junk));
}
check('ký tự lạ thì fromKociemba ném lỗi', (() => {
  try { fromKociemba('X'.repeat(54)); return false; } catch { return true; }
})());

console.log(fails === 0 ? '\nTẤT CẢ ĐỀU PASS' : `\n${fails} TEST LỖI`);
