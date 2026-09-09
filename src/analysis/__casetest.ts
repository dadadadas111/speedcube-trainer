import { parseAlg, invertAlg } from '../cube/alg';
import { classifyCornerAlg, describeFamily } from './cornerCase';
import { SEED_ALGS } from '../data/seedAlgs';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };
const cls = (a: string) => classifyCornerAlg(parseAlg(a));

// 1. An AUF BEFORE the algorithm is the same case (turn U, then do the same thing).
//    An AUF AFTER it is a different case: CMLL's goal is four corners placed
//    correctly relative to the blocks, so a trailing U leaves it unfinished.
{
  const base = cls("R U R' U R U2 R'")!;
  check('Sune classifies', !!base && base.cornersOnly && base.preservesBlocks);
  const preAuf = ["U R U R' U R U2 R'", "U2 R U R' U R U2 R'", "U' R U R' U R U2 R'"];
  check('AUF before the algorithm -> same case',
    preAuf.every((v) => cls(v)?.full === base.full), preAuf.map((v) => cls(v)?.full).join(' '));
  const postAuf = ["R U R' U R U2 R' U", "R U R' U R U2 R' U2"];
  check('AUF after the algorithm -> different case',
    postAuf.every((v) => cls(v)?.full !== base.full), postAuf.map((v) => cls(v)?.full).join(' '));
  check('but still the same family (corner orientations unchanged)',
    [...preAuf, ...postAuf].every((v) => cls(v)?.family === base.family));
}

// 2. Sune and Anti-Sune are different cases but share the "three twisted corners" shape
{
  const sune = cls("R U R' U R U2 R'")!;
  const anti = cls("R U2 R' U' R U' R'")!;
  check('Sune differs from Anti-Sune', sune.full !== anti.full, `${sune.full} vs ${anti.full}`);
  check('Sune: three corners twisted the same way', describeFamily(sune.family) === 'three corners twisted the same way', describeFamily(sune.family));
  check('Anti-Sune: three corners twisted the same way', describeFamily(anti.family) === 'three corners twisted the same way');
  check('but different families (opposite twist direction)', sune.family !== anti.family, `${sune.family} vs ${anti.family}`);
}

// 3. An algorithm and its inverse solve opposite cases
{
  const a = cls("R U R' U R U2 R'")!;
  const b = classifyCornerAlg(invertAlg(parseAlg("R U R' U R U2 R'")))!;
  check('the inverse gives a different case', a.full !== b.full, `${a.full} / ${b.full}`);
}

// 4. Four cases in the same Sune family must have four distinct signatures
{
  const sune = cls("R U R' U R U2 R'")!;
  const niklas = cls("R U' L' U R' U' L")!;
  check('Sune and Niklas share a family', sune.family === niklas.family, `${sune.family} vs ${niklas.family}`);
  check('but are different cases', sune.full !== niklas.full, `${sune.full} vs ${niklas.full}`);
}

// 5. An algorithm that drags a D-layer corner up is out of scope -> returns null
{
  check('the sexy move does not classify (it pulls up a D corner)', cls("R U R' U'") === null);
  const tperm = cls("R U R' U' R' F R2 U' R' U' R U R' F'");
  check('T-perm classifies', tperm !== null);
  check('T-perm keeps both blocks', tperm!.preservesBlocks);
  check('T-perm twists no corner', tperm!.family === '0000', tperm!.family);
  check('but does permute corners', tperm!.full !== '00000000', tperm!.full);
}

// 6. Every seeded algorithm classifies, and the families split as their names suggest
{
  const cmll = SEED_ALGS.filter((a) => a.group === 'CMLL');
  const results = cmll.map((a) => ({ name: a.name, c: cls(a.alg) }));
  check('every sample CMLL algorithm classifies', results.every((r) => r.c !== null));
  check('every sample CMLL algorithm keeps the blocks', results.every((r) => r.c!.preservesBlocks));
  const families = new Map<string, string[]>();
  for (const r of results) {
    const f = r.c!.family;
    if (!families.has(f)) families.set(f, []);
    families.get(f)!.push(r.name);
  }
  console.log('   families derived by computation:');
  for (const [f, names] of families) console.log(`     ${f}  ${describeFamily(f).padEnd(34)} ${names.join(', ')}`);
  check('the samples land in several different families', families.size >= 5, String(families.size));
  check('Sune and Anti-Sune are not lumped together',
    families.get(cls("R U R' U R U2 R'")!.family)?.includes('Anti-Sune') !== true);
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
