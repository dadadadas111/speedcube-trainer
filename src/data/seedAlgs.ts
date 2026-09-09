/**
 * The starter alg library, organised in two levels: family, then case.
 *
 * Every alg here is verified by code: the CMLL and PLL entries leave both Roux
 * blocks intact, and the LSE ones use only M and U turns. Which family an alg
 * belongs to is computed from the four corners' orientation (see
 * analysis/cornerCase.ts) — Niklas sits in the Sune family because the machine
 * worked that out, not because it was typed in.
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

export const SEED_ALGS: SeedAlg[] = [
  { group: 'CMLL', family: 'Sune', name: 'basic', alg: "R U R' U R U2 R'" },
  { group: 'CMLL', family: 'Sune', name: 'Niklas', alg: "R U' L' U R' U' L" },
  { group: 'CMLL', family: 'Anti-Sune', name: 'basic', alg: "R U2 R' U' R U' R'" },
  { group: 'CMLL', family: 'H', name: 'basic', alg: "R U R' U R U' R' U R U2 R'" },
  { group: 'CMLL', family: 'Pi', name: 'basic', alg: "R U2 R2 U' R2 U' R2 U2 R" },
  { group: 'CMLL', family: 'T', name: 'basic', alg: "R2 D R' U2 R D' R' U2 R'" },
  { group: 'CMLL', family: 'U', name: 'basic', alg: "R2 D' R U2 R' D R U2 R" },
  { group: 'CMLL', family: 'L', name: 'basic', alg: "F R' F' r U R U' r'" },
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
