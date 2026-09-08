import { SOLVED_STATE, applyMoves, toKociemba, isSolved, canonicalKey, PIECES, groupSolved } from './cube';
import { MOVE_PERMS, ROTATIONS } from './geometry';

let fails = 0;
const check = (name: string, cond: boolean, extra = '') => {
  if (!cond) { fails++; console.log('FAIL ' + name + ' ' + extra); } else console.log('ok   ' + name);
};

// 1. Facelet chuẩn Kociemba cho "F R" (lấy từ tài liệu gan-web-bluetooth)
const fr = toKociemba(applyMoves(SOLVED_STATE, ['F', 'R']));
check('F R -> facelets', fr === 'UUFUUFLLFUUURRRRRRFFRFFDFFDRRBDDBDDBLLDLLDLLDLBBUBBUBB', fr);

// 2. Bậc của các nước
for (const m of ['U', 'R', 'F', 'D', 'L', 'B', 'M', 'E', 'S', 'r', 'u', 'x', 'y', 'z']) {
  check(`${m}^4 = e`, isSolved(applyMoves(SOLVED_STATE, [m, m, m, m])) &&
    toKociemba(applyMoves(SOLVED_STATE, [m, m, m, m])) === toKociemba(SOLVED_STATE));
  check(`${m} ${m}' = e`, toKociemba(applyMoves(SOLVED_STATE, [m, m + "'"])) === toKociemba(SOLVED_STATE));
  check(`${m}2 = ${m}${m}`, toKociemba(applyMoves(SOLVED_STATE, [m + '2'])) === toKociemba(applyMoves(SOLVED_STATE, [m, m])));
}

// 3. Các đồng nhất thức lát cắt / nước rộng
const eq = (a: string[], b: string[]) => toKociemba(applyMoves(SOLVED_STATE, a)) === toKociemba(applyMoves(SOLVED_STATE, b));
check('M = R L\' x\'', eq(['M'], ['R', "L'", "x'"]));
check('E = U D\' y\'', eq(['E'], ['U', "D'", "y'"]));
check('S = F\' B z', eq(['S'], ["F'", 'B', 'z']));
check('r = R M\'', eq(['r'], ['R', "M'"]));
check('r = L x  (lý do sensor báo r thành L)', eq(['r'], ['L', 'x']));
check('l = R x\'', eq(['l'], ['R', "x'"]));
check('u = D y', eq(['u'], ['D', 'y']));
check('f = B z', eq(['f'], ['B', 'z']));
check("x = r L'", eq(['x'], ['r', "L'"]));
check('r M = R', eq(['r', 'M'], ['R']));

// 4. Sexy move bậc 6
check('(R U R\' U\')^6 = e', isSolved(applyMoves(SOLVED_STATE, Array(6).fill(['R','U',"R'","U'"]).flat())));
// Sune bậc 6
check('Sune^6 = e', isSolved(applyMoves(SOLVED_STATE, Array(6).fill(['R','U',"R'",'U','R','U2',"R'"]).flat())));
// T-perm là phép đối hợp
check('T-perm^2 = e', isSolved(applyMoves(SOLVED_STATE, Array(2).fill(['R','U',"R'","U'","R'",'F','R2',"U'","R'","U'",'R','U',"R'","F'"]).flat())));

// 5. Nhóm quay: đúng 24 phần tử, khối đã giải vẫn "đã giải" sau mọi phép quay
check('24 phép quay', ROTATIONS.length === 24, String(ROTATIONS.length));
check('canonicalKey bất biến với phép quay', ['x','y','z','x y','y2 z'].every(r =>
  canonicalKey(applyMoves(SOLVED_STATE, r.split(' '))) === canonicalKey(SOLVED_STATE)));
const scr = ['R','U',"F'",'L2','D',"B'",'R2','U'];
check('canonicalKey bất biến sau scramble', ['x','y','z',"x' y2"].every(r =>
  canonicalKey(applyMoves(applyMoves(SOLVED_STATE, scr), r.split(' '))) === canonicalKey(applyMoves(SOLVED_STATE, scr))));

// 6. Kích thước nhóm miếng
check('FB = 5 miếng (2 góc + 3 cạnh = 12 facelet)', PIECES.FB.length === 12, String(PIECES.FB.length));
check('SB = 5 miếng (12 facelet)', PIECES.SB.length === 12, String(PIECES.SB.length));
check('4 góc U = 12 facelet', PIECES.U_CORNERS.length === 12, String(PIECES.U_CORNERS.length));
check('6 cạnh LSE = 12 facelet', PIECES.LSE_EDGES.length === 12, String(PIECES.LSE_EDGES.length));

// 7. FB không bị phá bởi các nước Roux hợp lệ, và bị phá bởi nước phá khối
const idRot = ROTATIONS.find(r => r.every((v, i) => v === i))!;
const fbKeep = applyMoves(SOLVED_STATE, ['R', 'U', "R'", 'U', 'M', "U'", 'r']);
check('FB sống sót qua R/U/M/r', groupSolved(fbKeep, idRot, PIECES.FB));
check('FB bị phá bởi L', !groupSolved(applyMoves(SOLVED_STATE, ['L']), idRot, PIECES.FB));
check('FB bị phá bởi D', !groupSolved(applyMoves(SOLVED_STATE, ['D']), idRot, PIECES.FB));
check('SB sống sót qua L/U/M', groupSolved(applyMoves(SOLVED_STATE, ['L', 'U', "L'", 'M', "U'"]), idRot, PIECES.SB));

// 8. Hoán vị là song ánh
for (const [name, perm] of Object.entries(MOVE_PERMS)) {
  const seen = new Set(perm);
  if (seen.size !== 54) { fails++; console.log('FAIL hoán vị không song ánh: ' + name); }
}
console.log(fails === 0 ? '\nTẤT CẢ ĐỀU PASS' : `\n${fails} TEST LỖI`);
