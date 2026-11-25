/**
 * The top layer, flattened so nothing is hiding round the back.
 *
 * A drawn 3D cube shows three faces, and CMLL is read from four corners which
 * between them touch all four sides. One of them is always behind the cube,
 * which makes a recognition drill into a guessing game.
 *
 * So the sides are folded outward instead: the U face as a 3x3 in the middle,
 * and the top row of each side face laid flat against the edge it belongs to.
 * Every top-layer corner then appears three times, once on U and once on each
 * side it touches, and all four are legible at a glance. This is the shape
 * every printed OLL and CMLL sheet uses, and roux-trainers draws the same way.
 *
 * It deliberately cannot show the blocks. That is the whole point of it; the
 * distraction view is the ordinary cube.
 */

import { useMemo } from 'react';
import type { CubeState } from '../cube/cube';
import {
  CMLL_EDGES, STRIP_BACK, STRIP_FRONT, STRIP_LEFT, STRIP_RIGHT,
} from '../analysis/cmllDrill';
import { FACE_COLORS } from './palette';

interface Props {
  state: CubeState;
  /** Dim the edges, leaving the corners the case is actually read from */
  cornersOnly?: boolean;
  size?: number;
  className?: string;
}

// Where each sticker sits comes from analysis/cmllDrill, which is tested
// against the cube's own geometry; this file only draws it.
const [BACK, FRONT, RIGHT, LEFT] = [STRIP_BACK, STRIP_FRONT, STRIP_RIGHT, STRIP_LEFT];
const EDGES = new Set(CMLL_EDGES);

export default function CmllFace({ state, cornersOnly, size = 190, className }: Props) {
  const cells = useMemo(() => {
    const cell = 10;
    const gap = 0.9;
    const strip = cell * 0.44;
    const pad = cell * 0.18;
    const span = cell * 3;
    const o = strip + pad; // where the U grid starts
    const out: { key: number; x: number; y: number; w: number; h: number }[] = [];

    for (let i = 0; i < 9; i++) {
      out.push({ key: i, x: o + (i % 3) * cell, y: o + Math.floor(i / 3) * cell, w: cell, h: cell });
    }
    BACK.forEach((k, i) => out.push({ key: k, x: o + i * cell, y: 0, w: cell, h: strip }));
    FRONT.forEach((k, i) => out.push({ key: k, x: o + i * cell, y: o + span + pad, w: cell, h: strip }));
    LEFT.forEach((k, i) => out.push({ key: k, x: 0, y: o + i * cell, w: strip, h: cell }));
    RIGHT.forEach((k, i) => out.push({ key: k, x: o + span + pad, y: o + i * cell, w: strip, h: cell }));
    return { out, total: span + 2 * (strip + pad), gap };
  }, []);

  return (
    <svg
      viewBox={`0 0 ${cells.total} ${cells.total}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="CMLL case"
    >
      {cells.out.map(({ key, x, y, w, h }) => {
        const dim = cornersOnly && EDGES.has(key);
        return (
          <rect
            key={key}
            x={x + cells.gap / 2}
            y={y + cells.gap / 2}
            width={w - cells.gap}
            height={h - cells.gap}
            rx={1.4}
            fill={FACE_COLORS[state[key]]}
            opacity={dim ? 0.16 : 1}
          />
        );
      })}
    </svg>
  );
}
