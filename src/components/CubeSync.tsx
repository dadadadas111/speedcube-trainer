/**
 * Xử lý khi trạng thái app đang giữ lệch với khối thật trong tay.
 *
 * Có hai kiểu lệch, và hai nút khác nhau — quan trọng là chọn đúng nút:
 *
 *  - App lệch so với cube (rớt nước qua bluetooth): cube vẫn nhớ đúng, chỉ cần
 *    hỏi lại là xong.
 *  - CHÍNH CUBE nhớ sai (bạn tháo lắp, hoặc nó bỏ sót nước của chính nó): lúc
 *    này hỏi lại bao nhiêu lần cũng chỉ nhận về đúng cái sai đó. Phải giải khối
 *    về trạng thái đã giải rồi bảo cube "vị trí hiện tại là đã giải".
 */

import { useState } from 'react';
import { cubeLink } from '../smartcube/connection';
import { virtualCube } from '../smartcube/virtual';
import { useApp } from '../store/app';

type Result = { tone: 'good' | 'warn' | 'bad'; text: string } | null;

export default function CubeSync({ compact = false }: { compact?: boolean }) {
  const { settings, cubeStatus } = useApp();
  const [busy, setBusy] = useState<'sync' | 'reset' | null>(null);
  const [result, setResult] = useState<Result>(null);
  const usingVirtual = settings.keyboardCube && cubeStatus !== 'connected';

  const resync = async () => {
    setBusy('sync');
    setResult(null);
    try {
      if (usingVirtual) {
        setResult({ tone: 'warn', text: 'Khối ảo không có gì để hỏi lại — nó luôn khớp với app.' });
      } else {
        await cubeLink.resync();
        setResult({ tone: 'good', text: 'Đã hỏi lại cube và lấy đúng trạng thái nó đang nhớ.' });
      }
    } catch (e) {
      setResult({ tone: 'bad', text: `Không hỏi được cube: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  };

  const markSolved = async () => {
    if (
      !confirm(
        'Khối trong tay bạn có ĐANG ở trạng thái đã giải không?\n\n' +
          'Lệnh này bảo cube rằng vị trí hiện tại của nó là đã giải. Bấm nhầm lúc khối chưa giải thì mọi thứ sau đó sẽ sai hết.',
      )
    )
      return;
    setBusy('reset');
    setResult(null);
    try {
      if (usingVirtual) {
        virtualCube.reset();
        setResult({ tone: 'good', text: 'Khối ảo đã về trạng thái đã giải.' });
      } else {
        const confirmed = await cubeLink.resetToSolved();
        setResult(
          confirmed
            ? { tone: 'good', text: 'Xong — cube xác nhận đang ở trạng thái đã giải, app cũng vậy.' }
            : {
                tone: 'bad',
                text: 'Cube không nhận lệnh đặt lại. Thử tắt bật lại bluetooth của cube (xoay một mặt để đánh thức) rồi bấm lại.',
              },
        );
      }
    } catch (e) {
      setResult({ tone: 'bad', text: `Không đặt lại được: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  };

  const tone = { good: 'text-good', warn: 'text-warn', bad: 'text-bad' } as const;

  return (
    <div className={compact ? '' : 'flex flex-col gap-2'}>
      <div className="flex flex-wrap gap-2">
        <button className="btn !py-1 !text-[13px]" disabled={busy !== null} onClick={() => void resync()}>
          {busy === 'sync' ? 'Đang hỏi…' : 'Hỏi lại cube'}
        </button>
        <button className="btn btn-danger !py-1 !text-[13px]" disabled={busy !== null} onClick={() => void markSolved()}>
          {busy === 'reset' ? 'Đang đặt lại…' : 'Khối đang đã giải → đồng bộ'}
        </button>
      </div>
      {!compact && (
        <p className="max-w-[64ch] text-[13px] text-ink-400">
          <span className="text-ink-300">Hỏi lại cube</span> dùng khi app hiển thị khác với khối thật vì rớt nước
          qua bluetooth — cube vẫn nhớ đúng.{' '}
          <span className="text-ink-300">Khối đang đã giải</span> dùng khi chính cube nhớ sai; lúc đó hỏi lại chỉ
          nhận về đúng cái sai, phải giải khối xong rồi bấm nút này để đặt lại mốc.
        </p>
      )}
      {result && <p className={`text-[13px] ${tone[result.tone]}`}>{result.text}</p>}
    </div>
  );
}
