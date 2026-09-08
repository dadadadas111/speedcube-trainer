/**
 * Hiển thị scramble kèm chỉ dẫn: đã vặn tới đâu, nước tiếp theo là gì,
 * và nếu vặn sai thì cần vặn ngược lại những gì.
 */

import type { ScrambleProgress } from '../analysis/scrambleGuide';

interface Props {
  moves: string[];
  /** null khi không có smart cube — khi đó chỉ hiện scramble, không dẫn */
  progress: ScrambleProgress | null;
}

export default function ScrambleGuide({ moves, progress }: Props) {
  const done = progress?.done ?? -1;
  const lost = progress?.status === 'off-track';
  const complete = progress?.status === 'complete';

  return (
    <div>
      <p
        className="flex flex-wrap gap-x-1 gap-y-1.5 font-mono text-[clamp(1rem,2.2vw,1.5rem)] leading-none transition-opacity"
        style={{ opacity: lost ? 0.4 : 1 }}
      >
        {moves.map((m, i) => {
          const isDone = progress ? i < done : false;
          const isNext = progress ? i === done && !lost && !complete : false;
          return (
            <span
              key={i}
              className="rounded-[4px] px-1.5 py-1 transition-colors"
              style={{
                background: isNext ? 'var(--color-cube-blue)' : 'transparent',
                color: isNext ? '#fff' : isDone ? 'var(--color-ink-500)' : 'var(--color-ink-100)',
              }}
            >
              {m}
            </span>
          );
        })}
      </p>

      {progress && (
        <div className="mt-3">
          <div className="flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-full transition-[width,background-color]"
                style={{
                  width: `${(done / Math.max(1, progress.total)) * 100}%`,
                  background: lost ? 'var(--color-bad)' : complete ? 'var(--color-good)' : 'var(--color-cube-blue)',
                }}
              />
            </div>
            <span className="tnum shrink-0 font-mono text-[13px] text-ink-400">
              {done}/{progress.total}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Câu chỉ dẫn tương ứng với tình trạng hiện tại. */
export function ScrambleHint({ progress, notReady }: { progress: ScrambleProgress | null; notReady: boolean }) {
  if (notReady) {
    return (
      <div>
        <p className="text-[15px] font-semibold text-warn">Khối chưa ở trạng thái đã giải</p>
        <p className="mt-1 max-w-[52ch] text-sm text-ink-300">
          Scramble được tính từ khối đã giải. Hãy giải xong khối trước. Nếu khối trong tay bạn đã giải rồi mà
          app vẫn báo thế này thì hai bên đang lệch — dùng nút bên dưới.
        </p>
      </div>
    );
  }
  if (!progress) {
    return (
      <p className="text-sm text-ink-300">
        Kết nối smart cube để app dẫn bạn vặn scramble và bắt lỗi từng nước.
      </p>
    );
  }
  if (progress.status === 'complete') {
    return <p className="armed text-lg font-semibold text-good">Scramble xong — vặn nước đầu là đồng hồ chạy</p>;
  }
  if (progress.status === 'off-track') {
    return (
      <div>
        <p className="text-[15px] font-semibold text-bad">
          Vặn sai {progress.wrongMoves > 1 ? `${progress.wrongMoves} nước` : 'rồi'}
        </p>
        {progress.fix.length > 0 ? (
          <>
            <p className="mt-1 text-sm text-ink-300">
              {progress.done === 0
                ? 'Vặn ngược lại để về khối đã giải:'
                : `Vặn ngược lại để quay về nước thứ ${progress.done}:`}
            </p>
            <p className="mt-1.5 font-mono text-xl text-bad">{progress.fix.join(' ')}</p>
          </>
        ) : (
          <p className="mt-1 max-w-[52ch] text-sm text-ink-300">
            App không biết bạn đã vặn gì (có thể vừa mất kết nối). Giải khối về trạng thái đã giải rồi vặn lại
            từ đầu, hoặc đổi scramble khác.
          </p>
        )}
      </div>
    );
  }
  return (
    <div>
      <p className="text-[13px] text-ink-400">Nước tiếp theo</p>
      <p className="font-mono text-4xl font-semibold leading-none text-cube-blue">{progress.next}</p>
      <p className="mt-2 text-[13px] text-ink-400">
        {progress.done === 0 ? 'Bắt đầu từ khối đã giải.' : `Còn ${progress.total - progress.done} nước.`}
      </p>
    </div>
  );
}
