/**
 * Một solve Roux THẬT, lấy từ GAN i Carry 4 qua bluetooth.
 *
 * Đây là fixture hồi quy cho đúng lỗi mà dữ liệu giả lập không bắt được: bộ gộp
 * lát cắt cũ làm hỏng trạng thái, nên không bước nào được nhận ra. Dữ liệu giả
 * lập lọt lưới vì hai nửa của mỗi nước M trong đó cách nhau ~250ms nên chưa bao
 * giờ bị gộp — còn cube thật báo về cách nhau 6-121ms.
 */

export const REAL_SOLVE = {
  scramble: "F R B' R' F' U' B2 R2 B2 D2 F2 D L2 U R2 U' L2 F",
  timeMs: 16576,
  /** "nước@mốc thời gian ms", đúng như cảm biến báo về */
  moves: "U@0 F'@494 B@656 B@706 F'@712 U'@893 L'@1787 F@1925 F@2058 R'@2221 L@2227 D@2490 D@2612 R@2784 F@2965 L@3919 L@4053 L@4166 F'@4282 L'@4440 U'@4640 R'@4856 R'@4930 R'@5677 U'@5783 R@6026 U'@6139 R@6284 U'@6404 R'@6512 U@6594 R@6706 U'@6783 R'@6899 U@6986 R@7079 U'@7161 R'@7292 U'@7549 L'@7935 B'@8115 L@8272 U@8433 R'@8698 L@8718 F@9350 F@9545 F'@10717 R@11001 F'@11093 F'@11156 R'@11278 F'@11431 R@11499 F@11610 R'@11729 F'@11835 R@11923 F@12045 R'@12163 F'@12254 R@12374 F'@12513 L'@12666 U'@13376 U'@13485 L'@13626 R@13706 B'@13833 L@13986 R'@13996 U'@14125 L'@14255 R@14376 B'@14498 R'@14666 L@14689 U'@14822 U'@14892 R'@15074 L@15086 F'@15204 F'@15249 L'@15410 R@15470 U'@15635 R'@16198 L@16212 F'@16312 F'@16392 L'@16543 R@16576",
};

export function realSolveMoves(): { move: string; t: number }[] {
  return REAL_SOLVE.moves.split(' ').map((tok) => {
    const [move, t] = tok.split('@');
    return { move, t: Number(t) };
  });
}
