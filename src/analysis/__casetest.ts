import { parseAlg, invertAlg } from '../cube/alg';
import { classifyCornerAlg, caseSignature, describeFamily } from './cornerCase';
import { SEED_ALGS } from '../data/seedAlgs';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };
const cls = (a: string) => classifyCornerAlg(parseAlg(a));

// 1. An AUF at either end is the same case, and both have to be divided out.
//    Before is obvious: turn U, then do the same thing. After is the one that
//    used to be got wrong here — a trailing U was treated as leaving the case
//    unfinished, when the last six edges turn the top layer anyway, so corners
//    "solved but rotated" are solved. Dividing out only one of the two split
//    the forty-two cases into a hundred and sixty-two, which was invisible
//    while only algorithms were being classified and showed up the moment a
//    case read off a real solve had to match one.
{
  const base = cls("R U R' U R U2 R'")!;
  check('Sune classifies', !!base && base.cornersOnly && base.preservesBlocks);
  const preAuf = ["U R U R' U R U2 R'", "U2 R U R' U R U2 R'", "U' R U R' U R U2 R'"];
  check('AUF before the algorithm -> same case',
    preAuf.every((v) => cls(v)?.full === base.full), preAuf.map((v) => cls(v)?.full).join(' '));
  const postAuf = ["R U R' U R U2 R' U", "R U R' U R U2 R' U2"];
  check('AUF after the algorithm -> same case too',
    postAuf.every((v) => cls(v)?.full === base.full), postAuf.map((v) => cls(v)?.full).join(' '));
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

// 7. The CMLL set is the whole of CMLL: forty-two algs covering forty-two cases
{
  const cmll = SEED_ALGS.filter((a) => a.group === 'CMLL');
  check('there are forty-two CMLL algorithms', cmll.length === 42, String(cmll.length));

  // The count alone proves nothing — two algs for the same case and a missing
  // one elsewhere would still add up. Distinct corner states is the real test,
  // and it is what catches a transcription slip a spot check would sail past.
  const states = new Map<string, string[]>();
  for (const a of cmll) {
    const c = cls(a.alg)!;
    const key = c.full;
    if (!states.has(key)) states.set(key, []);
    states.get(key)!.push(`${a.family} ${a.name}`);
  }
  check('they cover forty-two DISTINCT corner states', states.size === 42, String(states.size));
  for (const [full, names] of states) {
    if (names.length > 1) check('no two algorithms share a case: ' + full, false, names.join(' / '));
  }

  // Each heading has to mean one thing. A name filed under the wrong family is
  // invisible in the library, because the library groups by what was typed.
  const byName = new Map<string, Set<string>>();
  for (const a of cmll) {
    if (!byName.has(a.family)) byName.set(a.family, new Set());
    byName.get(a.family)!.add(cls(a.alg)!.family);
  }
  for (const [name, codes] of byName) {
    check(`every "${name}" alg has the same corner orientation`, codes.size === 1, [...codes].join(', '));
  }
  // And the eight headings are the eight ways the corners can be oriented
  check('there are eight families', byName.size === 8, String(byName.size));
  check('O means nothing needs turning', [...(byName.get('O') ?? [])][0] === '0000');
}

// 8. The whole corner state space, counted. This is what pins the two AUFs
//    being divided out: get it wrong in either direction and the number moves.
{
  const perms: number[][] = [];
  const build = (left: number[], acc: number[]) => {
    if (!left.length) { perms.push([...acc]); return; }
    for (const x of left) build(left.filter((y) => y !== x), [...acc, x]);
  };
  build([0, 1, 2, 3], []);

  const signatures = new Set<string>();
  const families = new Set<string>();
  let states = 0;
  for (const pi of perms) {
    for (let t = 0; t < 81; t++) {
      const tw = [0, 1, 2, 3].map((i) => Math.floor(t / 3 ** i) % 3);
      // A cube with its bottom corners solved has its top four summing to zero
      if ((tw[0] + tw[1] + tw[2] + tw[3]) % 3 !== 0) continue;
      states++;
      const sig = caseSignature([0, 1, 2, 3].map((i) => ({ offset: (pi[i] - i + 4) % 4, twist: tw[i] })));
      signatures.add(sig.full);
      families.add(sig.family);
    }
  }
  check('there are 648 corner states', states === 648, String(states));
  check('which fall into 43 cases: the 42 of CMLL, plus solved', signatures.size === 43, String(signatures.size));
  check('and eight orientation families', families.size === 8, String(families.size));

  // So the library covering 42 distinct ones is complete coverage, not a count
  const library = new Set(
    SEED_ALGS.filter((a) => a.group === 'CMLL').map((a) => cls(a.alg)!.full),
  );
  const solved = caseSignature([0, 1, 2, 3].map(() => ({ offset: 0, twist: 0 }))).full;
  const missing = [...signatures].filter((x) => x !== solved && !library.has(x));
  check('the library covers every case there is', missing.length === 0, missing.join(' '));
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
