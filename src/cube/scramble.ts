/**
 * Sinh scramble. Ưu tiên random-state (chuẩn WCA) từ cubing.js nếu tải được,
 * nếu không thì rơi về random-move đủ tốt cho luyện tập.
 */

import { parseAlg } from './alg';

const FACES = ['U', 'D', 'R', 'L', 'F', 'B'];
const AXIS: Record<string, number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
const SUFFIX = ['', "'", '2'];

export function randomMoveScramble(length = 22): string[] {
  const out: string[] = [];
  let lastFace = '';
  let prevFace = '';
  while (out.length < length) {
    const face = FACES[Math.floor(Math.random() * 6)];
    if (face === lastFace) continue;
    // tránh dạng R L R (cùng trục, lặp mặt) vì có thể rút gọn
    if (AXIS[face] === AXIS[lastFace] && face === prevFace) continue;
    prevFace = lastFace;
    lastFace = face;
    out.push(face + SUFFIX[Math.floor(Math.random() * 3)]);
  }
  return out;
}

let randomStateFn: ((event: string) => Promise<{ toString(): string }>) | null | undefined;

/**
 * Scramble random-state qua cubing.js. Nạp động để app vẫn chạy được nếu gói
 * đó lỗi hoặc trình duyệt chặn worker.
 */
async function tryRandomState(): Promise<string[] | null> {
  try {
    if (randomStateFn === undefined) {
      const mod = await import('cubing/scramble');
      randomStateFn = mod.randomScrambleForEvent as never;
    }
    if (!randomStateFn) return null;
    const alg = await randomStateFn('333');
    return parseAlg(alg.toString());
  } catch {
    randomStateFn = null;
    return null;
  }
}

export async function generateScramble(preferRandomState = true): Promise<string[]> {
  if (preferRandomState) {
    const rs = await tryRandomState();
    if (rs && rs.length) return rs;
  }
  return randomMoveScramble();
}
