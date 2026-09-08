/**
 * Thư viện alg khởi đầu. Mọi alg ở đây đã được kiểm tra bằng code:
 * nhóm CMLL/PLL giữ nguyên hai khối Roux, nhóm LSE chỉ gồm nước M và U.
 * Đây chỉ là điểm xuất phát — hãy thêm bộ alg của riêng bạn, kể cả bằng cách
 * thực hiện thẳng trên cube.
 */

export interface SeedAlg {
  name: string;
  group: string;
  alg: string;
  notes?: string;
}

export const SEED_ALGS: SeedAlg[] = [
  { group: 'CMLL', name: 'Sune', alg: "R U R' U R U2 R'" },
  { group: 'CMLL', name: 'Anti-Sune', alg: "R U2 R' U' R U' R'" },
  { group: 'CMLL', name: 'H', alg: "R U R' U R U' R' U R U2 R'" },
  { group: 'CMLL', name: 'Pi', alg: "R U2 R2 U' R2 U' R2 U2 R" },
  { group: 'CMLL', name: 'T', alg: "R2 D R' U2 R D' R' U2 R'" },
  { group: 'CMLL', name: 'U', alg: "R2 D' R U2 R' D R U2 R" },
  { group: 'CMLL', name: 'L', alg: "F R' F' r U R U' r'" },
  { group: 'CMLL', name: 'Niklas', alg: "R U' L' U R' U' L" },
  { group: 'LSE', name: '4c — xoay vòng 3 cạnh', alg: "M2 U M U2 M' U M2" },
  { group: 'LSE', name: '4c — xoay vòng ngược', alg: "M2 U' M U2 M' U' M2" },
  { group: 'LSE', name: '4b — hoán vị UL/UR', alg: "M' U2 M U2" },
  { group: 'LSE', name: 'EO — lật hai cạnh đối', alg: "M' U M' U M' U2 M U M U M U2" },
  { group: 'Finger trick', name: 'Sexy move', alg: "R U R' U'", notes: 'Không phải alg giải — luyện tốc độ ngón.' },
  { group: 'Finger trick', name: 'Sledgehammer', alg: "R' F R F'", notes: 'Không phải alg giải — luyện tốc độ ngón.' },
  { group: 'PLL', name: 'T-perm', alg: "R U R' U' R' F R2 U' R' U' R U R' F'" },
  { group: 'PLL', name: 'Ua-perm', alg: "R U' R U R U R U' R' U' R2" },
  { group: 'PLL', name: 'Jb-perm', alg: "R U R' F' R U R' U' R' F R2 U' R' U'" },
];
