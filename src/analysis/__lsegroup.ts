/**
 * Duyệt toàn bộ nhóm LSE ⟨M, U⟩ để trả lời: "cả 6 cạnh đúng chiều" có kéo theo
 * "lát M đang thẳng hàng" không? Nếu có thì điều kiện thẳng hàng trong bộ nhận
 * dạng EO là thừa và nên bỏ đi (vì nó có thể đẩy biên EO muộn hơn thực tế).
 */
import { SOLVED_STATE, applyMove, toKociemba, LSE_UD_FACELETS, U_CENTER_FACELET } from '../cube/cube';

const GENS = ['M', "M'", 'M2', 'U', "U'", 'U2'];
const seen = new Set<string>([toKociemba(SOLVED_STATE)]);
let frontier = [SOLVED_STATE];
let goodAndMisaligned = 0;
let goodTotal = 0;
let depth = 0;

const allEdgesGood = (s: Uint8Array) => LSE_UD_FACELETS.every((f) => s[f] === 0 || s[f] === 3);
const aligned = (s: Uint8Array) => s[U_CENTER_FACELET] === 0 || s[U_CENTER_FACELET] === 3;

while (frontier.length) {
  const next: Uint8Array[] = [];
  for (const s of frontier) {
    if (allEdgesGood(s)) {
      goodTotal++;
      if (!aligned(s)) goodAndMisaligned++;
    }
    for (const g of GENS) {
      const t = applyMove(s, g);
      const k = toKociemba(t);
      if (!seen.has(k)) { seen.add(k); next.push(t); }
    }
  }
  frontier = next;
  depth++;
  if (depth > 40) break;
}
console.log('tổng số trạng thái LSE:', seen.size);
console.log('trạng thái "6 cạnh đúng chiều":', goodTotal);
console.log('trong đó lát M lệch:', goodAndMisaligned);
console.log(goodAndMisaligned === 0
  ? '=> Điều kiện thẳng hàng là THỪA: đúng chiều đã kéo theo thẳng hàng.'
  : '=> Điều kiện thẳng hàng CÓ ích: tồn tại trạng thái đúng chiều mà lát M lệch.');
