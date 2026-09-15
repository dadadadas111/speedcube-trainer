/**
 * The starter alg library, organised in two levels: family, then case.
 *
 * The CMLL set is the full forty-two from speedcubedb.com/a/3x3/CMLL, and it is
 * forty-two because that is how many there are: every way the four top corners
 * can be turned and arranged once the two Roux blocks are built. Nothing here
 * was taken on trust — `analysis/__casetest.ts` checks that each one parses,
 * moves nothing but corners, leaves both blocks standing, and that the whole
 * set covers forty-two DISTINCT corner states, which is what catches a bad
 * transcription that a spot check would sail past.
 *
 * Which family an alg belongs to is computed from the corners' orientation
 * rather than read off its name, so the eight headings below are a label on
 * work the machine did: O is all four oriented, H and Pi have all four twisted,
 * U, T and L have two, Sune and Anti-Sune three.
 *
 * The LSE entries use only M and U turns, and the PLL ones keep both blocks.
 *
 * This is only a starting point. Add your own algs and the app files them.
 */

export interface SeedAlg {
  group: string;
  family: string;
  name: string;
  alg: string;
  notes?: string;
}

/**
 * The eight CMLL algs that used to be seeded here, before the full set.
 *
 * Kept so the upgrade can tell one of its own from an alg you typed in: the old
 * ones are replaced, and anything you added yourself is left exactly alone.
 */
export const RETIRED_CMLL_ALGS: string[] = [
  "R U R' U R U2 R'",
  "R U' L' U R' U' L",
  "R U2 R' U' R U' R'",
  "R U R' U R U' R' U R U2 R'",
  "R U2 R2 U' R2 U' R2 U2 R",
  "R2 D R' U2 R D' R' U2 R'",
  "R2 D' R U2 R' D R U2 R",
  "F R' F' r U R U' r'",
];

export const SEED_ALGS: SeedAlg[] = [
  { group: 'CMLL', family: 'O', name: 'Adjacent', alg: "R U R' F' R U R' U' R' F R2 U' R'" },
  { group: 'CMLL', family: 'O', name: 'Diagonal', alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'" },
  { group: 'CMLL', family: 'H', name: 'Columns', alg: "U R U R' U R U' R' U R U2 R'" },
  { group: 'CMLL', family: 'H', name: 'Rows', alg: "F R U R' U' R U R' U' R U R' U' F'" },
  { group: 'CMLL', family: 'H', name: 'Column', alg: "R' F2 D R2 U R2 D' F2 R" },
  { group: 'CMLL', family: 'H', name: 'Row', alg: "U2 r U' r2 D' r U' r' D r2 U r'" },
  { group: 'CMLL', family: 'Pi', name: 'Right Bar', alg: "F R U R' U' R U R' U' F'" },
  { group: 'CMLL', family: 'Pi', name: 'Down Slash', alg: "U F R' F' R U2 R U' R' U R U2 R'" },
  { group: 'CMLL', family: 'Pi', name: 'X', alg: "R' F2 D R2 U' R2 D' F2 R" },
  { group: 'CMLL', family: 'Pi', name: 'Up Slash', alg: "R U2 R' U' R U R' U2 R' F R F'" },
  { group: 'CMLL', family: 'Pi', name: 'Columns', alg: "U' r U' r2 D' r U r' D r2 U r'" },
  { group: 'CMLL', family: 'Pi', name: 'Left Bar', alg: "U' R' U' R' F R F' R U' R' U2 R" },
  { group: 'CMLL', family: 'U', name: 'Up Slash', alg: "U2 R2 D R' U2 R D' R' U2 R'" },
  { group: 'CMLL', family: 'U', name: 'Down Slash', alg: "R2 D' R U2 R' D R U2 R" },
  { group: 'CMLL', family: 'U', name: 'Bottom Row', alg: "R' U' R U' R' U2 R2 U R' U R U2 R'" },
  { group: 'CMLL', family: 'U', name: 'Rows', alg: "U' F R2 D R' U R D' R2 U' F'" },
  { group: 'CMLL', family: 'U', name: 'X', alg: "U2 r U' r' U r' D' r U' r' D r" },
  { group: 'CMLL', family: 'U', name: 'Upper Row', alg: "U' F R U R' U' F'" },
  { group: 'CMLL', family: 'T', name: 'Left Bar', alg: "U' R U R' U' R' F R F'" },
  { group: 'CMLL', family: 'T', name: 'Right Bar', alg: "U L' U' L U L F' L' F" },
  { group: 'CMLL', family: 'T', name: 'Rows', alg: "R U2 R' U' R U' R2 U2 R U R' U R" },
  { group: 'CMLL', family: 'T', name: 'Bottom Row', alg: "r' U r U2 R2 F R F' R" },
  { group: 'CMLL', family: 'T', name: 'Top Row', alg: "r' D' r U r' D r U' r U r'" },
  { group: 'CMLL', family: 'T', name: 'Columns', alg: "U2 r U' r2 D' r U2 r' D r2 U r'" },
  { group: 'CMLL', family: 'Sune', name: 'Left Bar', alg: "U R U R' U R U2 R'" },
  { group: 'CMLL', family: 'Sune', name: 'X', alg: "U L' U2 L U2 r U' r' F" },
  { group: 'CMLL', family: 'Sune', name: 'Up Slash', alg: "U F R' F' R U2 R U2 R'" },
  { group: 'CMLL', family: 'Sune', name: 'Columns', alg: "U R U R' U' R' F R F' R U R' U R U2 R'" },
  { group: 'CMLL', family: 'Sune', name: 'Right Bar', alg: "U' R U R' U R' F R F' R U2 R'" },
  { group: 'CMLL', family: 'Sune', name: 'Down Slash', alg: "U r U' r' F R' F' R" },
  { group: 'CMLL', family: 'Anti-Sune', name: 'Right Bar', alg: "U R' U' R U' R' U2 R" },
  { group: 'CMLL', family: 'Anti-Sune', name: 'Columns', alg: "U2 R U R2 F' r F R U' r2 F r" },
  { group: 'CMLL', family: 'Anti-Sune', name: 'Down Slash', alg: "U' F' L F L' U2 L' U2 L" },
  { group: 'CMLL', family: 'Anti-Sune', name: 'X', alg: "U' R U2 R' U2 R' F R F'" },
  { group: 'CMLL', family: 'Anti-Sune', name: 'Up Slash', alg: "U' R' F R F' r U r'" },
  { group: 'CMLL', family: 'Anti-Sune', name: 'Left Bar', alg: "U R U2 R' F R' F' R U' R U' R'" },
  { group: 'CMLL', family: 'L', name: 'Best', alg: "U' F' r U r' U' r' F r" },
  { group: 'CMLL', family: 'L', name: 'Good', alg: "U2 F R' F' R U R U' R'" },
  { group: 'CMLL', family: 'L', name: 'Pure', alg: "R U R' U R U' R' U R U' R' U R U2 R'" },
  { group: 'CMLL', family: 'L', name: 'Front Commutator', alg: "U2 R U2 R D R' U2 R D' R2" },
  { group: 'CMLL', family: 'L', name: 'Diagonal', alg: "U2 R U2 R2 F R F' R U2 R'" },
  { group: 'CMLL', family: 'L', name: 'Back Commutator', alg: "U R' U2 R' D' R U2 R' D R2" },
  { group: 'LSE', family: '4a - EO', name: 'flip two opposite edges', alg: "M' U M' U M' U2 M U M U M U2" },
  { group: 'LSE', family: '4b - UL/UR', name: 'swap', alg: "M' U2 M U2" },
  { group: 'LSE', family: '4c - M slice', name: '3-cycle', alg: "M2 U M U2 M' U M2" },
  { group: 'LSE', family: '4c - M slice', name: 'reverse 3-cycle', alg: "M2 U' M U2 M' U' M2" },
  { group: 'PLL', family: 'T-perm', name: 'standard', alg: "R U R' U' R' F R2 U' R' U' R U R' F'" },
  { group: 'PLL', family: 'U-perm', name: 'Ua', alg: "R U' R U R U R U' R' U' R2" },
  { group: 'PLL', family: 'J-perm', name: 'Jb', alg: "R U R' F' R U R' U' R' F R2 U' R' U'" },
  { group: 'Finger trick', family: 'Trigger', name: 'Sexy move', alg: "R U R' U'", notes: 'Not a solving alg — finger speed practice.' },
  { group: 'Finger trick', family: 'Trigger', name: 'Sledgehammer', alg: "R' F R F'", notes: 'Not a solving alg — finger speed practice.' },
];
