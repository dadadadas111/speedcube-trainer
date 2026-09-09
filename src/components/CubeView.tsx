/** Picks how to draw the cube from the settings: 3D or flat net. */

import type { CubeState } from '../cube/cube';
import { useApp } from '../store/app';
import Cube3D, { type Quaternion } from './Cube3D';
import CubeNet from './CubeNet';

interface Props {
  state: CubeState;
  viewRotation?: Uint8Array | null;
  highlight?: number[] | null;
  size?: number;
  className?: string;
  quaternion?: Quaternion | null;
  interactive?: boolean;
  animate?: { move: string; progress: number } | null;
  /** Force one view, ignoring the global setting */
  force?: '3d' | 'net';
}

export default function CubeView({ size = 180, force, quaternion, interactive, animate, ...rest }: Props) {
  const { settings } = useApp();
  const mode = force ?? settings.cubeView;
  if (mode === 'net') {
    // The net is 3/4 as tall as it is wide, so scale it to take similar space
    // The net cannot draw a turning layer, so it ignores the animation
    return <CubeNet {...rest} size={size * 1.15} />;
  }
  return <Cube3D {...rest} size={size} quaternion={quaternion} interactive={interactive} animate={animate} />;
}
