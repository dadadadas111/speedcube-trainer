import { parseAlg, invertAlg } from '../cube/alg';
import { classifyCornerAlg, describeFamily } from './cornerCase';
import { SEED_ALGS } from '../data/seedAlgs';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };
const cls = (a: string) => classifyCornerAlg(parseAlg(a));

// 1. AUF TRƯỚC alg là cùng một case (chỉ cần xoay lớp U rồi làm y hệt).
//    AUF SAU alg lại là case khác, vì đích của CMLL là bốn góc về đúng chỗ so
//    với hai khối, nên thêm một nước U ở cuối là chưa xong.
{
  const base = cls("R U R' U R U2 R'")!;
  check('Sune phân loại được', !!base && base.cornersOnly && base.preservesBlocks);
  const preAuf = ["U R U R' U R U2 R'", "U2 R U R' U R U2 R'", "U' R U R' U R U2 R'"];
  check('AUF trước alg -> vẫn cùng case',
    preAuf.every((v) => cls(v)?.full === base.full), preAuf.map((v) => cls(v)?.full).join(' '));
  const postAuf = ["R U R' U R U2 R' U", "R U R' U R U2 R' U2"];
  check('AUF sau alg -> case khác',
    postAuf.every((v) => cls(v)?.full !== base.full), postAuf.map((v) => cls(v)?.full).join(' '));
  check('nhưng vẫn cùng họ (hướng bốn góc không đổi)',
    [...preAuf, ...postAuf].every((v) => cls(v)?.family === base.family));
}

// 2. Sune và Anti-Sune là hai case khác nhau nhưng cùng dạng "ba góc xoay"
{
  const sune = cls("R U R' U R U2 R'")!;
  const anti = cls("R U2 R' U' R U' R'")!;
  check('Sune khác Anti-Sune', sune.full !== anti.full, `${sune.full} vs ${anti.full}`);
  check('Sune: ba góc xoay cùng chiều', describeFamily(sune.family) === 'ba góc xoay cùng chiều', describeFamily(sune.family));
  check('Anti-Sune: ba góc xoay cùng chiều', describeFamily(anti.family) === 'ba góc xoay cùng chiều');
  check('nhưng khác họ (chiều xoay ngược nhau)', sune.family !== anti.family, `${sune.family} vs ${anti.family}`);
}

// 3. Alg và nghịch đảo của nó giải hai case ngược nhau
{
  const a = cls("R U R' U R U2 R'")!;
  const b = classifyCornerAlg(invertAlg(parseAlg("R U R' U R U2 R'")))!;
  check('alg nghịch đảo ra case khác', a.full !== b.full, `${a.full} / ${b.full}`);
}

// 4. Bốn case của cùng một họ Sune phải là bốn chữ ký khác nhau
{
  const sune = cls("R U R' U R U2 R'")!;
  const niklas = cls("R U' L' U R' U' L")!;
  check('Sune và Niklas cùng họ', sune.family === niklas.family, `${sune.family} vs ${niklas.family}`);
  check('nhưng khác case', sune.full !== niklas.full, `${sune.full} vs ${niklas.full}`);
}

// 5. Alg kéo góc lớp dưới lên trên thì không thuộc dạng này -> trả về null
{
  check('sexy move không phân loại được (nó lôi góc lớp D lên)', cls("R U R' U'") === null);
  const tperm = cls("R U R' U' R' F R2 U' R' U' R U R' F'");
  check('T-perm phân loại được', tperm !== null);
  check('T-perm giữ nguyên hai khối', tperm!.preservesBlocks);
  check('T-perm không xoay góc nào', tperm!.family === '0000', tperm!.family);
  check('nhưng có hoán vị góc', tperm!.full !== '00000000', tperm!.full);
}

// 6. Cả bộ seed đều phân loại được, và các họ tách ra đúng như tên đặt
{
  const cmll = SEED_ALGS.filter((a) => a.group === 'CMLL');
  const results = cmll.map((a) => ({ name: a.name, c: cls(a.alg) }));
  check('mọi alg CMLL mẫu đều phân loại được', results.every((r) => r.c !== null));
  check('mọi alg CMLL mẫu đều giữ hai khối', results.every((r) => r.c!.preservesBlocks));
  const families = new Map<string, string[]>();
  for (const r of results) {
    const f = r.c!.family;
    if (!families.has(f)) families.set(f, []);
    families.get(f)!.push(r.name);
  }
  console.log('   nhóm suy ra từ tính toán:');
  for (const [f, names] of families) console.log(`     ${f}  ${describeFamily(f).padEnd(34)} ${names.join(', ')}`);
  check('các alg mẫu rơi vào nhiều họ khác nhau', families.size >= 5, String(families.size));
  check('Sune và Anti-Sune không bị gộp chung',
    families.get(cls("R U R' U R U2 R'")!.family)?.includes('Anti-Sune') !== true);
}

console.log(fails === 0 ? '\nTẤT CẢ ĐỀU PASS' : `\n${fails} TEST LỖI`);
