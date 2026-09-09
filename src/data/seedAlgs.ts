/**
 * Thư viện alg khởi đầu, xếp theo hai tầng: họ rồi tới case.
 *
 * Mọi alg ở đây đã được kiểm bằng code: nhóm CMLL/PLL giữ nguyên hai khối Roux,
 * nhóm LSE chỉ gồm nước M và U. Riêng việc alg nào thuộc họ nào thì app tự tính
 * ra được từ hướng của bốn góc (xem analysis/cornerCase.ts) — Niklas nằm cùng họ
 * với Sune là do máy suy ra chứ không phải do gõ tay.
 *
 * Đây chỉ là điểm xuất phát. Thêm alg của riêng bạn thì app sẽ tự xếp vào đúng họ.
 */

export interface SeedAlg {
  group: string;
  family: string;
  name: string;
  alg: string;
  notes?: string;
}

export const SEED_ALGS: SeedAlg[] = [
  { group: 'CMLL', family: 'Sune', name: 'cơ bản', alg: "R U R' U R U2 R'" },
  { group: 'CMLL', family: 'Sune', name: 'Niklas', alg: "R U' L' U R' U' L" },
  { group: 'CMLL', family: 'Anti-Sune', name: 'cơ bản', alg: "R U2 R' U' R U' R'" },
  { group: 'CMLL', family: 'H', name: 'cơ bản', alg: "R U R' U R U' R' U R U2 R'" },
  { group: 'CMLL', family: 'Pi', name: 'cơ bản', alg: "R U2 R2 U' R2 U' R2 U2 R" },
  { group: 'CMLL', family: 'T', name: 'cơ bản', alg: "R2 D R' U2 R D' R' U2 R'" },
  { group: 'CMLL', family: 'U', name: 'cơ bản', alg: "R2 D' R U2 R' D R U2 R" },
  { group: 'CMLL', family: 'L', name: 'cơ bản', alg: "F R' F' r U R U' r'" },
  { group: 'LSE', family: '4a — EO', name: 'lật hai cạnh đối', alg: "M' U M' U M' U2 M U M U M U2" },
  { group: 'LSE', family: '4b — UL/UR', name: 'hoán vị', alg: "M' U2 M U2" },
  { group: 'LSE', family: '4c — lát M', name: 'xoay vòng 3 cạnh', alg: "M2 U M U2 M' U M2" },
  { group: 'LSE', family: '4c — lát M', name: 'xoay vòng ngược', alg: "M2 U' M U2 M' U' M2" },
  { group: 'PLL', family: 'T-perm', name: 'chuẩn', alg: "R U R' U' R' F R2 U' R' U' R U R' F'" },
  { group: 'PLL', family: 'U-perm', name: 'Ua', alg: "R U' R U R U R U' R' U' R2" },
  { group: 'PLL', family: 'J-perm', name: 'Jb', alg: "R U R' F' R U R' U' R' F R2 U' R' U'" },
  { group: 'Finger trick', family: 'Trigger', name: 'Sexy move', alg: "R U R' U'", notes: 'Không phải alg giải — luyện tốc độ ngón.' },
  { group: 'Finger trick', family: 'Trigger', name: 'Sledgehammer', alg: "R' F R F'", notes: 'Không phải alg giải — luyện tốc độ ngón.' },
];
