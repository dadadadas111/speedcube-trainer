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

type RandomScrambleFn = (event: string) => Promise<{ toString(): string }>;
let randomStateFn: RandomScrambleFn | null | undefined;

/** Nạp động; nếu hỏng thì trả null để bên gọi rơi về scramble random-move. */
async function tryRandomState(): Promise<string[] | null> {
  try {
    if (randomStateFn === undefined) {
      // cubing.js thử ba cách tạo worker theo thứ tự. Cách mặc định dựa vào
      // `import.meta.resolve`, không hợp với bundler. Cách "esbuild" thì import
      // chính module worker rồi lấy URL nó tự khai báo — đúng thứ bundler xử lý
      // được, nên bản build mới tìm ra file worker đã bị đổi tên theo hash.
      const [mod, search] = await Promise.all([import('cubing/scramble'), import('cubing/search')]);
      search.setSearchDebug({ prioritizeEsbuildWorkaroundForWorkerInstantiation: true });
      randomStateFn = mod.randomScrambleForEvent as unknown as RandomScrambleFn;
    }
    if (!randomStateFn) return null;
    const alg = await randomStateFn('333');
    const moves = parseAlg(alg.toString());
    return moves.length ? moves : null;
  } catch (err) {
    console.warn('Không dùng được scramble random-state, tạm dùng random-move.', err);
    randomStateFn = null;
    return null;
  }
}

export type ScrambleSource = 'random-state' | 'random-move';

export interface Scramble {
  moves: string[];
  /**
   * Nguồn thật sự đã dùng. Cần trả về để giao diện nói rõ khi phải dùng hàng
   * thay thế — trước đây chỗ này rơi về random-move mà không ai biết.
   */
  source: ScrambleSource;
}

export async function generateScramble(preferRandomState = true): Promise<Scramble> {
  if (preferRandomState) {
    const rs = await tryRandomState();
    if (rs && rs.length) return { moves: rs, source: 'random-state' };
  }
  return { moves: randomMoveScramble(), source: 'random-move' };
}
