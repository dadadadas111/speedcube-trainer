/**
 * Draws the cube as a flat net.
 *
 * `viewRotation` lets us view the cube from the solver's frame, which matters
 * because the model's frame can drift from reality after slice moves.
 */

import { useMemo } from 'react';
import { applyPerm, type CubeState } from '../cube/cube';
import { FACE_COLORS } from './palette';

interface Props {
  state: CubeState;
  viewRotation?: Uint8Array | null;
  /** Facelets to highlight; everything else dims */
  highlight?: number[] | null;
  size?: number;
  className?: string;
  /** Face letters (U/R/F/D/L/B) in the corner of each face */
  showFaceLabels?: boolean;
}

// where each face sits in the 4x3 grid (column, row)
const FACE_GRID: [number, number][] = [
  [1, 0], // U
  [2, 1], // R
  [1, 1], // F
  [1, 2], // D
  [0, 1], // L
  [3, 1], // B
];
const FACE_NAMES = ['U', 'R', 'F', 'D', 'L', 'B'];

export default function CubeNet({ state, viewRotation, highlight, size = 132, className, showFaceLabels }: Props) {
  const shown = useMemo(() => (viewRotation ? applyPerm(state, viewRotation) : state), [state, viewRotation]);
  const hl = useMemo(() => (highlight ? new Set(highlight) : null), [highlight]);

  const cell = size / 12; // 4 faces across * 3 stickers
  const gap = Math.max(1, cell * 0.08);
  const w = cell * 12;
  const h = cell * 9;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={(size * 9) / 12}
      className={className}
      role="img"
      aria-label="Cube state"
    >
      {FACE_GRID.map(([gx, gy], face) => (
        <g key={face} transform={`translate(${gx * cell * 3} ${gy * cell * 3})`}>
          {Array.from({ length: 9 }, (_, i) => {
            const idx = face * 9 + i;
            const dim = hl ? !hl.has(idx) : false;
            return (
              <rect
                key={i}
                x={(i % 3) * cell + gap / 2}
                y={Math.floor(i / 3) * cell + gap / 2}
                width={cell - gap}
                height={cell - gap}
                rx={cell * 0.16}
                fill={FACE_COLORS[shown[idx]]}
                opacity={dim ? 0.34 : 1}
              />
            );
          })}
          {showFaceLabels && (
            <text
              x={cell * 3 - 2}
              y={cell * 3 - 3}
              textAnchor="end"
              fontSize={cell * 0.5}
              fill="#10141a"
              opacity={0.4}
              fontFamily="IBM Plex Mono, monospace"
            >
              {FACE_NAMES[face]}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
