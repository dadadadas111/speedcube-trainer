/**
 * Xử lý khi trạng thái app đang giữ lệch với khối thật trong tay.
 *
 * Có hai kiểu lệch, và hai nút khác nhau:
 *  - App lệch so với cube (rớt nước qua bluetooth): hỏi lại cube là xong.
 *  - Chính cube lệch so với thực tế (bạn tháo lắp, hoặc cube bỏ sót nước của
 *    chính nó): phải nói cho cube biết "bây giờ mày đang ở trạng thái đã giải",
 *    và chỉ được bấm khi khối trong tay THẬT SỰ đã giải.
 */

import { useState } from 'react';
import { cubeLink } from '../smartcube/connection';
import { virtualCube } from '../smartcube/virtual';
import { useApp } from '../store/app';

export default function CubeSync({ compact = false }: { compact?: boolean }) {
  const { settings, cubeStatus } = useApp();
  const [busy, setBusy] = useState<'sync' | 'reset' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const usingVirtual = settings.keyboardCube && cubeStatus !== 'connected';

  const resync = async () => {
    setBusy('sync');
    setNote(null);
    try {
      if (usingVirtual) {
        setNote('Khối ảo không có gì để hỏi lại — nó luôn khớp với app.');
      } else {
        await cubeLink.resync();
        setNote('Đã hỏi lại cube và cập nhật trạng thái.');
      }
    } catch (e) {
      setNote(`Không hỏi được cube: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const markSolved = async () => {
    if (!confirm('Chỉ bấm khi khối trong tay bạn ĐANG ở trạng thái đã giải.\n\nLệnh này báo cho cube biết vị trí hiện tại là đã giải. Bấm nhầm lúc khối chưa giải sẽ làm mọi thứ sau đó sai hết.')) return;
    setBusy('reset');
    setNote(null);
    try {
      if (usingVirtual) virtualCube.reset();
      else await cubeLink.resetToSolved();
      setNote('Đã đặt lại: cube và app cùng coi đây là trạng thái đã giải.');
    } catch (e) {
      setNote(`Không đặt lại được: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={compact ? '' : 'flex flex-col gap-2'}>
      <div className="flex flex-wrap gap-2">
        <button className="btn !py-1 !text-[13px]" disabled={busy !== null} onClick={() => void resync()}>
          {busy === 'sync' ? 'Đang hỏi…' : 'Hỏi lại cube'}
        </button>
        <button className="btn btn-danger !py-1 !text-[13px]" disabled={busy !== null} onClick={() => void markSolved()}>
          Khối đang đã giải
        </button>
      </div>
      {!compact && (
        <p className="max-w-[62ch] text-[13px] text-ink-400">
          <span className="text-ink-300">Hỏi lại cube</span> dùng khi app hiển thị khác với khối thật vì rớt
          nước qua bluetooth — cube vẫn biết đúng, chỉ cần hỏi lại.{' '}
          <span className="text-ink-300">Khối đang đã giải</span> dùng khi chính cube cũng sai; chỉ bấm khi khối
          trong tay thật sự đã giải.
        </p>
      )}
      {note && <p className="text-[13px] text-warn">{note}</p>}
    </div>
  );
}
