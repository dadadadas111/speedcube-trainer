import { MOVE_PERMS, FACELET_POS, FACELET_NORMAL, moveTurn, rotateVecDegrees } from './geometry';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };
const near = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

/**
 * Kiểm chứng cốt lõi của hoạt hình: quay lớp đi trọn vẹn 90 (hoặc 180) độ phải
 * đưa mỗi ô màu về đúng chỗ mà bảng hoán vị của nước đó chỉ ra. Nếu sai dấu hay
 * sai trục thì hoạt hình sẽ quay ngược, và test này bắt được ngay.
 */
for (const move of ['R', "R'", 'R2', 'U', "U'", 'L', 'F', "B'", 'D2', 'M', "M'", 'M2', 'E', 'S', 'r', "l'", 'u']) {
  const turn = moveTurn(move);
  if (!turn) { check('hiểu được nước ' + move, false); continue; }
  const perm = MOVE_PERMS[move];
  // perm[j] = ô màu đi từ j tới... thực ra out[j] = state[perm[j]], nên ô perm[j] chuyển tới chỗ j
  let ok = true;
  let moved = 0;
  for (let j = 0; j < 54; j++) {
    const src = perm[j];
    const inLayer = turn.inLayer(src);
    if (!inLayer) { if (src !== j) ok = false; continue; }
    moved++;
    const p = rotateVecDegrees(FACELET_POS[src], turn.axis, turn.quarters * 90);
    const n = rotateVecDegrees(FACELET_NORMAL[src], turn.axis, turn.quarters * 90);
    if (!near(p, FACELET_POS[j]) || !near(n, FACELET_NORMAL[j])) ok = false;
  }
  check(`hoạt hình ${move.padEnd(3)} quay trọn vòng khớp đúng bảng hoán vị (${moved} ô)`, ok);
}

// Nửa chừng thì phải nằm giữa, không nhảy sẵn tới đích
{
  const turn = moveTurn('R')!;
  const f = FACELET_POS.findIndex((_, i) => turn.inLayer(i) && FACELET_NORMAL[i][2] === 1);
  const half = rotateVecDegrees(FACELET_POS[f], turn.axis, turn.quarters * 45);
  check('quay nửa chừng thì ô màu nằm giữa hai vị trí',
    !near(half, FACELET_POS[f]) && Math.abs(Math.hypot(...half) - Math.hypot(...FACELET_POS[f])) < 1e-6);
}
check('nước không hiểu được thì trả null', moveTurn('Z9') === null);

console.log(fails === 0 ? '\nTẤT CẢ ĐỀU PASS' : `\n${fails} TEST LỖI`);
