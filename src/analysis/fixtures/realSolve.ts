/**
 * REAL Roux solves, captured from a GAN i Carry 4 over bluetooth.
 *
 * This is the regression fixture for exactly the bug synthetic data missed: the
 * old slice merger corrupted the state, so no step was ever detected. Synthetic
 * data slipped through because its two halves of each M move were ~250ms apart
 * and so never merged — a real cube reports them 6-121ms apart.
 */

export const REAL_SOLVE = {
  scramble: "F R B' R' F' U' B2 R2 B2 D2 F2 D L2 U R2 U' L2 F",
  timeMs: 16576,
  /** "move@timestamp ms", exactly as the sensor reports it */
  moves: "U@0 F'@494 B@656 B@706 F'@712 U'@893 L'@1787 F@1925 F@2058 R'@2221 L@2227 D@2490 D@2612 R@2784 F@2965 L@3919 L@4053 L@4166 F'@4282 L'@4440 U'@4640 R'@4856 R'@4930 R'@5677 U'@5783 R@6026 U'@6139 R@6284 U'@6404 R'@6512 U@6594 R@6706 U'@6783 R'@6899 U@6986 R@7079 U'@7161 R'@7292 U'@7549 L'@7935 B'@8115 L@8272 U@8433 R'@8698 L@8718 F@9350 F@9545 F'@10717 R@11001 F'@11093 F'@11156 R'@11278 F'@11431 R@11499 F@11610 R'@11729 F'@11835 R@11923 F@12045 R'@12163 F'@12254 R@12374 F'@12513 L'@12666 U'@13376 U'@13485 L'@13626 R@13706 B'@13833 L@13986 R'@13996 U'@14125 L'@14255 R@14376 B'@14498 R'@14666 L@14689 U'@14822 U'@14892 R'@15074 L@15086 F'@15204 F'@15249 L'@15410 R@15470 U'@15635 R'@16198 L@16212 F'@16312 F'@16392 L'@16543 R@16576",
};

/**
 * Two more solves from the same cube, recorded with it held the other way up.
 *
 * These are the regression fixture for a bug the first solve could never catch:
 * the step detector only ever looked for the block whose colours were the ones
 * the app calls bottom-left. Rotating the frame the state is read in moves the
 * positions but leaves the colours where they are, so a solver whose first block
 * is any of the other eleven colour pairs got nothing at all — every step landed
 * on the final move at once. The first solve happened to use the matching
 * colours, which is exactly why it looked fine.
 */
export const REAL_SOLVE_2 = {
  scramble: "F B D B U B U F U2 L2 U2 F2 D2 B R2 D2 B' R2 L2",
  timeMs: 21202,
  moves: "D'@0 D'@61 F@341 F@444 U'@828 L@1110 U'@1198 U'@1263 L'@1392 U'@1537 U'@1616 L'@2594 B'@2813 U'@3202 L'@3638 U@3731 L@3807 U@4202 R'@4348 L@4495 L@4553 F'@4627 L'@4729 F@4792 L'@4854 F'@4965 F'@5036 L@5144 F'@5316 F'@5385 L'@5548 R@5619 L'@5637 U@5761 R@5918 B@6406 B@6552 R'@7011 B@7071 B@7173 B@7550 B@7621 R@7738 R'@8053 B@8112 B@8210 R@8366 B@8484 B@8532 R@8614 D'@8693 R'@8835 D@8908 L'@9297 R@9342 D'@9820 L'@10059 R@10059 F'@10167 R'@10275 L@10362 D'@10443 L'@10517 R@10620 F'@10670 L'@10741 R@10753 U@11264 L'@11425 R@11436 B'@11527 B'@11591 L'@11646 R@11772 D'@11822 L'@12227 R@12232 L'@12289 R@12290 U'@12340 L'@12840 R@12853 L'@13225 R@13232 D'@13368 D'@13423 R'@13518 L@13629 B'@13704 R@13775 L'@13776 D'@13864 D@14302 R'@14383 L@14511 B'@14581 L'@14622 R@20787 U'@20837 U@21202",
};

export const REAL_SOLVE_3 = {
  scramble: "D2 U2 F2 L2 B' R2 F L2 R2 F' U2 B' U' L2 B R' F' L F' D U'",
  timeMs: 16239,
  moves: "R@0 F'@203 D@384 D@469 F@661 F@1262 R@2080 R@2235 R@2578 U'@3846 L'@4099 L@4436 U@4578 U@4684 R@5182 D'@5605 R@6845 D@7163 L'@7304 D@7611 L'@7989 R@7990 F@8142 F@8232 L'@8412 R@8573 L'@8624 R@8629 B@8819 L'@9028 B'@9173 B'@9245 R@9418 D'@9872 L@10001 D@10108 L'@10234 D'@10800 D@11769 L@12406 D@12498 L'@12631 D@12706 L@12803 D'@12866 D'@12921 L'@13027 D@13759 R'@13834 L@13956 B'@14042 L'@14119 R@14235 D'@14285 R'@14376 L@14502 B'@14626 L'@14682 R@14691 D'@15220 L'@15808 R@15813 L'@15904 R@15908 U'@15974 U'@16045 R@16173 L'@16173 L'@16233 R@16239",
};

export function parseMoves(s: string): { move: string; t: number }[] {
  return s.split(' ').map((tok) => {
    const [move, t] = tok.split('@');
    return { move, t: Number(t) };
  });
}

export function realSolveMoves(): { move: string; t: number }[] {
  return parseMoves(REAL_SOLVE.moves);
}
