/** Chọn cách vẽ khối theo thiết lập: 3D hay trải phẳng. */

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
  /** Ép một kiểu hiển thị, bỏ qua thiết lập chung */
  force?: '3d' | 'net';
}

export default function CubeView({ size = 180, force, quaternion, interactive, animate, ...rest }: Props) {
  const { settings } = useApp();
  const mode = force ?? settings.cubeView;
  if (mode === 'net') {
    // Bản trải phẳng cao bằng 3/4 chiều ngang; bù lại để hai kiểu chiếm chỗ tương đương
    // Bản trải phẳng không vẽ được lớp đang quay nên bỏ qua phần hoạt hình
    return <CubeNet {...rest} size={size * 1.15} />;
  }
  return <Cube3D {...rest} size={size} quaternion={quaternion} interactive={interactive} animate={animate} />;
}
