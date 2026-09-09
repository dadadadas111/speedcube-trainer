/**
 * A 3D cube built from CSS transforms — no graphics library needed.
 *
 * The position and normal of all 54 stickers come straight from the coordinate
 * model in cube/geometry.ts, the same source of truth the solver engine uses.
 * The CSS Y axis points down, so every model-to-CSS conversion flips Y.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyPerm, type CubeState } from '../cube/cube';
import { FACELET_NORMAL, FACELET_POS, moveTurn } from '../cube/geometry';
import { FACE_COLORS } from './palette';

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

interface Props {
  state: CubeState;
  viewRotation?: Uint8Array | null;
  /** Facelets to highlight; the rest dim */
  highlight?: number[] | null;
  size?: number;
  /** Orientation from the cube's gyroscope. When set, the on-screen cube follows your hands. */
  quaternion?: Quaternion | null;
  /** Allow dragging to rotate (on by default) */
  interactive?: boolean;
  /**
   * A turn in progress: `state` is the state BEFORE the move, and the affected
   * layer is drawn rotated by `progress` (0 to 1).
   */
  animate?: { move: string; progress: number } | null;
  className?: string;
}

/**
 * The CSS Y axis points down, so rotations about X and Z flip sign relative to
 * the model, while rotations about Y stay the same.
 */
const CSS_AXIS = ['rotateX', 'rotateY', 'rotateZ'] as const;
const CSS_SIGN = [-1, 1, -1];

/**
 * The easing of a turn: fast at first, slowing, overshooting slightly and
 * settling back — the feel of a layer clicking into place, not sliding evenly.
 */
function easeTurn(p: number): number {
  if (p >= 1) return 1;
  const c = 1.15;
  const t = p - 1;
  return 1 + t * t * ((c + 1) * t + c);
}

/** Scale a hex colour's brightness, used for view-dependent shading. */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

type Mat3 = [number, number, number, number, number, number, number, number, number];

const rotX = (d: number): Mat3 => {
  const r = (d * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
const rotY = (d: number): Mat3 => {
  const r = (d * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
const rotZ = (d: number): Mat3 => {
  const r = (d * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};
const mul3 = (a: Mat3, b: Mat3): Mat3 =>
  [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j])) as Mat3;
const apply3 = (m: Mat3, v: readonly number[]) =>
  [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];

/** A light fixed relative to the viewer: slightly up, left and in front. */
const LIGHT = (() => {
  const v = [-0.35, -0.55, 0.76];
  const len = Math.hypot(...v);
  return v.map((x) => x / len);
})();

/** Default view angle: the top, front and right faces are all visible. */
const DEFAULT_VIEW = { rx: -22, ry: -32 };

/** Rotate a div from its default plane (facing CSS +Z) onto each face's normal. */
function faceRotation(n: readonly number[]): string {
  if (n[1] === 1) return 'rotateX(90deg)';   // U
  if (n[1] === -1) return 'rotateX(-90deg)'; // D
  if (n[0] === 1) return 'rotateY(90deg)';   // R
  if (n[0] === -1) return 'rotateY(-90deg)'; // L
  if (n[2] === 1) return '';                 // F
  return 'rotateY(180deg)';                  // B
}

/** Six black body faces, so you cannot see through the gaps between stickers. */
const BODY_FACES = [
  [0, 1, 0],
  [0, -1, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

/**
 * The cube's quaternion -> a CSS matrix.
 *
 * The cube reports orientation in its own axes: +X is the red face, +Y the blue
 * one, +Z the white one. The app's model has +x right, +y up (white), +z front
 * (green). So we change basis first, then flip Y for CSS.
 */
function quaternionToMatrix3d(q: Quaternion): string {
  const { x, y, z, w } = q;
  const n = Math.hypot(x, y, z, w) || 1;
  const [qx, qy, qz, qw] = [x / n, y / n, z / n, w / n];
  // rotation matrix in the cube's own axes
  const g = [
    [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)],
    [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)],
    [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)],
  ];
  // basis change cube -> model: Xc=x, Yc=-z, Zc=y (columns are the cube axes' images)
  const C = [
    [1, 0, 0],
    [0, 0, 1],
    [0, -1, 0],
  ];
  const mul = (a: number[][], b: number[][]): number[][] =>
    a.map((row) => b[0].map((_, j) => row.reduce((sum, v, k) => sum + v * b[k][j], 0)));
  const Ct = [
    [C[0][0], C[1][0], C[2][0]],
    [C[0][1], C[1][1], C[2][1]],
    [C[0][2], C[1][2], C[2][2]],
  ];
  const m = mul(mul(C, g), Ct);
  // CSS flips the Y axis
  const D = [
    [1, 0, 0],
    [0, -1, 0],
    [0, 0, 1],
  ];
  const c = mul(mul(D, m), D);
  // matrix3d takes column-major order
  return `matrix3d(${c[0][0]},${c[1][0]},${c[2][0]},0,${c[0][1]},${c[1][1]},${c[2][1]},0,${c[0][2]},${c[1][2]},${c[2][2]},0,0,0,0,1)`;
}

export default function Cube3D({
  state,
  viewRotation,
  highlight,
  size = 200,
  quaternion,
  interactive = true,
  animate = null,
  className = '',
}: Props) {
  const shown = useMemo(() => (viewRotation ? applyPerm(state, viewRotation) : state), [state, viewRotation]);
  const hl = useMemo(() => (highlight ? new Set(highlight) : null), [highlight]);
  const [view, setView] = useState(DEFAULT_VIEW);
  const drag = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null);

  const turn = useMemo(() => (animate ? moveTurn(animate.move) : null), [animate]);
  const layerDeg = turn && animate ? turn.quarters * 90 * easeTurn(animate.progress) * CSS_SIGN[turn.axis] : 0;
  const layerTransform = turn ? `${CSS_AXIS[turn.axis]}(${layerDeg}deg) ` : '';

  /**
   * The current view matrix, used to shade each face. Without it the cube looks
   * as flat as a sticker sheet; with it, it reads as a solid.
   */
  const viewMatrix = useMemo<Mat3>(() => {
    if (quaternion) {
      const { x, y, z, w } = quaternion;
      const n = Math.hypot(x, y, z, w) || 1;
      const [qx, qy, qz, qw] = [x / n, y / n, z / n, w / n];
      const g: Mat3 = [
        1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw),
        2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw),
        2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy),
      ];
      const C: Mat3 = [1, 0, 0, 0, 0, 1, 0, -1, 0];
      const Ct: Mat3 = [1, 0, 0, 0, 0, -1, 0, 1, 0];
      const D: Mat3 = [1, 0, 0, 0, -1, 0, 0, 0, 1];
      return mul3(mul3(D, mul3(mul3(C, g), Ct)), D);
    }
    return mul3(rotX(view.rx), rotY(view.ry));
  }, [quaternion, view.rx, view.ry]);

  const layerMatrix = useMemo<Mat3>(() => {
    if (!turn) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const f = turn.axis === 0 ? rotX : turn.axis === 1 ? rotY : rotZ;
    return f(layerDeg);
  }, [turn, layerDeg]);

  const brightness = (normal: readonly number[], inLayer: boolean) => {
    const cssN = [normal[0], -normal[1], normal[2]];
    const n = apply3(viewMatrix, inLayer ? apply3(layerMatrix, cssN) : cssN);
    const d = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
    // Half-lambert: faces turned away stay lit rather than going black, enough
    // to read as 3D without muddying the sticker colours.
    return 0.76 + 0.24 * (0.5 + 0.5 * d);
  };

  const unit = size / 5;
  const sticker = unit * 0.9;
  const body = unit * 3;

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive) return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, rx: view.rx, ry: view.ry };
    },
    [interactive, view],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setView({
      rx: Math.max(-89, Math.min(89, d.rx - (e.clientY - d.y) * 0.45)),
      ry: d.ry + (e.clientX - d.x) * 0.45,
    });
  }, []);

  const endDrag = useCallback(() => {
    drag.current = null;
  }, []);

  // Keyboard: arrow keys rotate, for anyone not using a mouse
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 45 : 15;
    const map: Record<string, [number, number]> = {
      ArrowLeft: [0, -step],
      ArrowRight: [0, step],
      ArrowUp: [step, 0],
      ArrowDown: [-step, 0],
    };
    const d = map[e.key];
    if (!d) return;
    e.preventDefault();
    setView((v) => ({ rx: Math.max(-89, Math.min(89, v.rx + d[0])), ry: v.ry + d[1] }));
  }, []);

  useEffect(() => {
    if (quaternion) drag.current = null;
  }, [quaternion]);

  const sceneTransform = quaternion
    ? quaternionToMatrix3d(quaternion)
    : `rotateX(${view.rx}deg) rotateY(${view.ry}deg)`;

  return (
    <div
      className={`relative select-none ${className}`}
      style={{ width: size, height: size, perspective: size * 3.2, touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      tabIndex={interactive && !quaternion ? 0 : -1}
      role="img"
      aria-label="Cube, three dimensional"
      title={quaternion ? 'Following the cube gyroscope' : interactive ? 'Drag to rotate' : undefined}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transformStyle: 'preserve-3d',
          transform: sceneTransform,
          transition: quaternion || drag.current ? 'none' : 'transform 220ms ease-out',
          cursor: interactive && !quaternion ? 'grab' : 'default',
        }}
      >
        {BODY_FACES.map((n, i) => (
          <div
            key={`body-${i}`}
            style={{
              position: 'absolute',
              width: body,
              height: body,
              marginLeft: -body / 2,
              marginTop: -body / 2,
              background: '#080a0e',
              borderRadius: unit * 0.14,
              transform: `translate3d(${n[0] * unit * 1.5}px, ${-n[1] * unit * 1.5}px, ${n[2] * unit * 1.5}px) ${faceRotation(n)}`,
            }}
          />
        ))}
        {FACELET_POS.map((p, i) => {
          const n = FACELET_NORMAL[i];
          const dim = hl ? !hl.has(i) : false;
          const inLayer = turn?.inLayer(i) ?? false;
          // push out slightly so stickers do not z-fight with the body faces
          const out = 0.02;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: sticker,
                height: sticker,
                marginLeft: -sticker / 2,
                marginTop: -sticker / 2,
                background: shade(FACE_COLORS[shown[i]], brightness(n, inLayer)),
                opacity: dim ? 0.3 : 1,
                borderRadius: unit * 0.16,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.22), inset 0 0 0 1px rgba(0,0,0,.35)',
                // The layer rotation goes FIRST so it acts in the whole cube's
                // frame, exactly like a layer turning about its own axis.
                transform: `${inLayer ? layerTransform : ''}translate3d(${(p[0] + n[0] * out) * unit}px, ${-(p[1] + n[1] * out) * unit}px, ${(p[2] + n[2] * out) * unit}px) ${faceRotation(n)}`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
