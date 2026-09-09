import { SOLVED_STATE, applyMove, applyMoves, applyPerm, isSolved } from '../cube/cube';
import { ROTATIONS, MOVE_PERMS, composePerm, IDENTITY_PERM } from '../cube/geometry';

/** Hoán vị ứng với một chuỗi phép quay toàn khối, ví dụ "x y". */
function rotPerm(spec: string): Uint8Array {
  let p: Uint8Array = IDENTITY_PERM as Uint8Array;
  for (const m of spec.split(' ')) p = composePerm(p, MOVE_PERMS[m]);
  return p;
}
import { parseAlg, invertAlg } from '../cube/alg';
import { ScrambleTracker, isAtStart } from './scrambleGuide';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

const SCRAMBLE = parseAlg("R U' F2 D B' R2 U L' D2 F R2 B U2 L");

// 1. Vặn đúng từng nước
{
  const t = new ScrambleTracker(SCRAMBLE);
  let s = SOLVED_STATE;
  check('bắt đầu: chưa vặn nước nào', t.update(s).done === 0);
  check('gợi ý nước đầu đúng', t.peek().next === SCRAMBLE[0], String(t.peek().next));
  let allOk = true;
  SCRAMBLE.forEach((m, i) => {
    s = applyMove(s, m);
    const p = t.update(s, m);
    if (p.done !== i + 1 || p.status === 'off-track') allOk = false;
    if (i < SCRAMBLE.length - 1 && p.next !== SCRAMBLE[i + 1]) allOk = false;
  });
  check('theo dõi đúng suốt scramble', allOk);
  check('kết thúc là complete', t.peek().status === 'complete' && t.peek().next === null);
}

// 2. Cầm khối nghiêng. Xoay cả khối trong tay KHÔNG làm đổi trạng thái vật lý,
//    chỉ đổi cách mảng facelet được ghi. Bộ theo dõi phải bất biến với chuyện đó.
{
  const prefixes: Uint8Array[] = [SOLVED_STATE];
  SCRAMBLE.forEach((m) => prefixes.push(applyMove(prefixes[prefixes.length - 1], m)));
  for (const rot of ['y', "x'", 'z2', 'x y']) {
    const perm = ROTATIONS.find((r) => r.join() === rotPerm(rot).join())!;
    const t = new ScrambleTracker(SCRAMBLE);
    let ok = true;
    prefixes.forEach((p, i) => {
      const seen = applyPerm(p, perm);           // đúng khối đó, cầm nghiêng đi
      if (t.update(seen, SCRAMBLE[i - 1]).done !== i) ok = false;
    });
    check(`cầm nghiêng (${rot}) vẫn theo dõi đúng`, ok && t.peek().status === 'complete');
  }
}

// 3. Vặn nhầm mặt đối diện phải bị bắt lỗi (đây là chỗ dễ nhầm nhất)
{
  const t = new ScrambleTracker(SCRAMBLE);
  const s = applyMove(SOLVED_STATE, 'L');   // scramble bắt đầu bằng R
  const p = t.update(s, 'L');
  check('vặn nhầm mặt đối diện -> off-track', p.status === 'off-track', p.status);
  check('gợi ý sửa là vặn ngược lại', p.fix.join(' ') === "L'", p.fix.join(' '));
}

// 4. Vặn đúng mặt nhưng sai chiều: đây là "đang vặn dở", không phải sai.
//    Vặn thêm cho đủ vòng là thành đúng, không cần vặn ngược lại.
{
  const t = new ScrambleTracker(SCRAMBLE);
  const p = t.update(applyMove(SOLVED_STATE, "R'"), "R'");
  check('vặn đúng mặt sai chiều -> đang vặn dở', p.status === 'partial', p.status);
  check('chỉ rõ còn thiếu bao nhiêu', p.remaining === 'R2', String(p.remaining));
}

// 5. Lạc nhiều nước rồi sửa theo gợi ý thì quay lại đúng đường
{
  const t = new ScrambleTracker(SCRAMBLE);
  let s = SOLVED_STATE;
  for (const m of SCRAMBLE.slice(0, 5)) { s = applyMove(s, m); t.update(s, m); }
  check('đã vặn đúng 5 nước', t.peek().done === 5);
  for (const m of ['F', 'D2', "B'"]) { s = applyMove(s, m); t.update(s, m); }
  const p = t.peek();
  check('lạc 3 nước -> off-track', p.status === 'off-track' && p.wrongMoves === 3, `${p.status}/${p.wrongMoves}`);
  check('gợi ý sửa = vặn ngược 3 nước đó', p.fix.join(' ') === "B D2 F'", p.fix.join(' '));
  // làm theo gợi ý
  for (const m of p.fix) { s = applyMove(s, m); t.update(s, m); }
  const after = t.peek();
  check('sửa xong thì về đúng chỗ cũ', after.status === 'on-track' && after.done === 5, `${after.status}/${after.done}`);
  check('và chỉ đúng nước tiếp theo', after.next === SCRAMBLE[5], String(after.next));
  // vặn nốt
  for (const m of SCRAMBLE.slice(5)) { s = applyMove(s, m); t.update(s, m); }
  check('vặn nốt thì xong', t.peek().status === 'complete');
  check('trạng thái cuối đúng bằng scramble', applyMoves(SOLVED_STATE, SCRAMBLE).join() === s.join());
}

// 6. Lùi lại: vặn ngược một nước đúng thì tiến độ giảm chứ không báo lỗi
{
  const t = new ScrambleTracker(SCRAMBLE);
  let s = SOLVED_STATE;
  for (const m of SCRAMBLE.slice(0, 4)) { s = applyMove(s, m); t.update(s, m); }
  s = applyMove(s, invertAlg([SCRAMBLE[3]])[0]);
  const p = t.update(s, invertAlg([SCRAMBLE[3]])[0]);
  check('vặn lùi -> tiến độ lùi, không báo sai', p.status === 'on-track' && p.done === 3, `${p.status}/${p.done}`);
}

// 7. Mất kết nối giữa chừng: không biết đã vặn gì thì không bịa gợi ý
{
  const t = new ScrambleTracker(SCRAMBLE);
  const p = t.update(applyMoves(SOLVED_STATE, ['F', 'B', 'L2']));  // không truyền move
  check('không biết đã vặn gì -> vẫn báo off-track', p.status === 'off-track');
  check('và không bịa ra gợi ý sửa', p.fix.length === 0);
}

// 8. isAtStart bất biến với hướng cầm
{
  check('khối đã giải, cầm hướng nào cũng nhận ra',
    ['y', 'x2', "z' y"].every((r) => isAtStart(applyMoves(SOLVED_STATE, r.split(' ')))));
  check('khối chưa giải thì không', !isAtStart(applyMove(SOLVED_STATE, 'R')));
  check('nhất quán với isSolved', isAtStart(SOLVED_STATE) === isSolved(SOLVED_STATE));
}

/* ---- Nước 180 độ: cube báo thành hai sự kiện quý, không được nháy đỏ giữa chừng ---- */
{
  const SCR = parseAlg("U2 R F2 L' D2 B");
  const t = new ScrambleTracker(SCR);
  let s = SOLVED_STATE;
  t.update(s);
  check('bắt đầu: nước tiếp theo là U2', t.peek().next === 'U2');

  // nửa đầu của U2
  s = applyMove(s, 'U');
  let p = t.update(s, 'U');
  check('mới vặn nửa U2 -> đang vặn dở, KHÔNG phải sai', p.status === 'partial', p.status);
  check('và chỉ rõ còn thiếu bao nhiêu', p.remaining === 'U', String(p.remaining));
  check('tiến độ chưa nhích', p.done === 0);

  // nửa sau
  s = applyMove(s, 'U');
  p = t.update(s, 'U');
  check('vặn nốt nửa sau -> đúng đường', p.status === 'on-track' && p.done === 1, `${p.status}/${p.done}`);
  check('và chuyển sang nước kế tiếp', p.next === 'R');
}

/* ---- Vặn đúng mặt nhưng sai chiều cũng là "đang vặn dở" ---- */
{
  const t = new ScrambleTracker(parseAlg("U2 R F2"));
  const p = t.update(applyMove(SOLVED_STATE, "U'"), "U'");
  check('U2 mà vặn ngược chiều -> vẫn là đang vặn dở', p.status === 'partial', p.status);
  // đã vặn U' (một nhịp ngược); vặn thêm U' nữa là thành đúng 180 độ
  check("còn thiếu U' nữa", p.remaining === "U'", String(p.remaining));
}
{
  const t = new ScrambleTracker(parseAlg("R U F"));
  const p = t.update(applyMove(SOLVED_STATE, "R'"), "R'");
  check('nước quý mà vặn ngược chiều -> đang vặn dở', p.status === 'partial', p.status);
  check('còn thiếu R2', p.remaining === 'R2', String(p.remaining));
  // vặn tiếp cho đủ
  const p2 = t.update(applyMove(applyMove(SOLVED_STATE, "R'"), 'R2'), 'R2');
  check('vặn bù cho đủ thì thành đúng', p2.status === 'on-track' && p2.done === 1, `${p2.status}/${p2.done}`);
}

/* ---- Đang vặn dở mà nhảy sang mặt khác thì mới là sai ---- */
{
  const t = new ScrambleTracker(parseAlg("U2 R F2"));
  let s = applyMove(SOLVED_STATE, 'U');
  check('nửa U2 -> vàng', t.update(s, 'U').status === 'partial');
  s = applyMove(s, 'F');
  const p = t.update(s, 'F');
  check('đụng sang mặt khác -> mới báo sai', p.status === 'off-track', p.status);
  check('gợi ý sửa gồm cả nửa U đã lỡ vặn', p.fix.join(' ') === "F' U'", p.fix.join(' '));
}

/* ---- Vặn nhầm hẳn mặt khác ngay từ đầu vẫn phải đỏ ngay ---- */
{
  const t = new ScrambleTracker(parseAlg("U2 R F2"));
  check('vặn mặt hoàn toàn khác -> đỏ ngay', t.update(applyMove(SOLVED_STATE, 'F'), 'F').status === 'off-track');
}

/* ---- Cả scramble toàn nước 180, vặn từng nửa một, không được đỏ lần nào ---- */
{
  const SCR = parseAlg("U2 R2 F2 L2 D2 B2");
  const t = new ScrambleTracker(SCR);
  let s = SOLVED_STATE;
  t.update(s);
  const seen: string[] = [];
  for (const m of SCR) {
    const half = m[0];
    for (let k = 0; k < 2; k++) {
      s = applyMove(s, half);
      seen.push(t.update(s, half).status);
    }
  }
  check('không có lần nào bị báo sai', !seen.includes('off-track'), seen.join(','));
  check('xen kẽ đúng nhịp vàng rồi xanh',
    seen.every((st, i) => (i % 2 === 0 ? st === 'partial' : st === 'on-track' || st === 'complete')), seen.join(','));
  check('kết thúc là xong scramble', t.peek().status === 'complete');
}

console.log(fails === 0 ? '\nTẤT CẢ ĐỀU PASS' : `\n${fails} TEST LỖI`);
