/**
 * A CMLL case drawn the way cubers draw one.
 *
 * Looking down at the top layer, with the front face at the bottom. The four
 * corner squares are the stickers on top; the tabs around the outside are the
 * same corners' side stickers, which is where the information actually is —
 * two cases can look identical from directly above and be told apart only by
 * which way the top-colour stickers are pointing.
 *
 * Edges and the centre are drawn as holes, because CMLL does not care about
 * them and drawing them in colour would suggest it does.
 *
 * A name in a table says which case you were slow at; this says what you were
 * looking at when you were slow, which is the thing you actually recognise.
 */

import { useMemo } from 'react';
import { applyMoves, SOLVED_STATE, type CubeState } from '../cube/cube';
import { invertAlg, parseAlg } from '../cube/alg';
import { FACELET_NORMAL, faceletsOfCubie, type Vec3 } from '../cube/geometry';
import { FACE_COLORS } from './palette';

/** The four top corners, going round: back-left, back-right, front-right, front-left. */
const SLOTS: Vec3[] = [
  [-1, 1, -1],
  [1, 1, -1],
  [1, 1, 1],
  [-1, 1, 1],
];

const sameVec = (a: readonly number[], b: readonly number[]) =>
  a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/**
 * Which facelet of each corner faces up, sideways and front/back.
 *
 * Worked out from the geometry rather than written down: a list of indices
 * typed by hand is a list that is wrong in one place and draws a diagram nobody
 * can tell is wrong.
 */
export const CORNERS = SLOTS.map((pos) => {
  const fs = faceletsOfCubie(pos);
  const find = (normal: Vec3) => fs.find((i) => sameVec(FACELET_NORMAL[i], normal))!;
  return {
    up: find([0, 1, 0]),
    side: find([pos[0], 0, 0]), // L or R
    face: find([0, 0, pos[2]]), // F or B
  };
});

/**
 * Where each corner's three stickers sit in the drawing.
 *
 * A hundred-unit square: a band of tabs, the three-by-three top face, another
 * band of tabs. Written out per corner rather than derived from a grid, because
 * the derivation needed a conditional per edge and was harder to check than the
 * eight numbers it replaced.
 */
const TAB = 13;
const GAP = 2.5;
const U = (100 - 2 * (TAB + GAP)) / 3;
const CELL = (i: number) => TAB + GAP + i * U;
const FAR = 100 - TAB;

const PLACES = [
  // back-left: tab on the left, tab above
  { up: [0, 0], side: [0, CELL(0), TAB, U], face: [CELL(0), 0, U, TAB] },
  // back-right: right, above
  { up: [2, 0], side: [FAR, CELL(0), TAB, U], face: [CELL(2), 0, U, TAB] },
  // front-right: right, below
  { up: [2, 2], side: [FAR, CELL(2), TAB, U], face: [CELL(2), FAR, U, TAB] },
  // front-left: left, below
  { up: [0, 2], side: [0, CELL(2), TAB, U], face: [CELL(0), FAR, U, TAB] },
] as const;

export interface Props {
  /** The algorithm that solves the case; the case is what it undoes */
  alg?: string;
  /** Or the position directly, when one is already to hand */
  state?: CubeState;
  size?: number;
  className?: string;
}

export default function CmllDiagram({ alg, state, size = 34, className }: Props) {
  const shown = useMemo(() => {
    if (state) return state;
    if (!alg) return null;
    try {
      return applyMoves(SOLVED_STATE, invertAlg(parseAlg(alg)));
    } catch {
      return null;
    }
  }, [alg, state]);

  if (!shown) {
    return <span className={className} style={{ display: 'inline-block', width: size, height: size }} aria-hidden />;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="CMLL case"
    >
      {/* The five pieces CMLL does not care about, drawn as empty slots rather
          than left out. Without them the four corners float and the thing does
          not read as a face of a cube at all; in colour they would say the
          edges matter, which is the opposite of true. */}
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) =>
          (r === 1 || c === 1) ? (
            <rect
              key={`${r}-${c}`}
              x={CELL(c)}
              y={CELL(r)}
              width={U}
              height={U}
              rx={3}
              fill="var(--color-ink-700)"
            />
          ) : null,
        ),
      )}
      {CORNERS.map((c, i) => {
        const place = PLACES[i];
        const [sx, sy, sw, sh] = place.side;
        const [fx, fy, fw, fh] = place.face;
        return (
          <g key={i}>
            <rect
              x={CELL(place.up[0])}
              y={CELL(place.up[1])}
              width={U}
              height={U}
              rx={3}
              fill={FACE_COLORS[shown[c.up]]}
            />
            <rect x={sx} y={sy} width={sw} height={sh} rx={2} fill={FACE_COLORS[shown[c.side]]} />
            <rect x={fx} y={fy} width={fw} height={fh} rx={2} fill={FACE_COLORS[shown[c.face]]} />
          </g>
        );
      })}
    </svg>
  );
}
