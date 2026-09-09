import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store/app';
import { cubeLink } from '../smartcube/connection';
import MacPrompt from './MacPrompt';
import CubeSync from './CubeSync';

export default function CubeStatus() {
  const { cubeStatus, cubeInfo, settings } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [garbled, setGarbled] = useState(false);
  const [macAsk, setMacAsk] = useState<{ deviceName: string; resolve: (mac: string | null) => void } | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const asked = useRef(false);

  // Thư viện gọi hàm này khi không tự đọc được MAC. Trả về một Promise để chờ
  // người dùng điền vào hộp thoại, thay cho window.prompt trần.
  useEffect(() => {
    cubeLink.askForMac = (deviceName) =>
      new Promise<string | null>((resolve) => {
        asked.current = true;
        setMacAsk({ deviceName, resolve });
      });
    return () => {
      cubeLink.askForMac = null;
    };
  }, []);

  // Giải mã ra rác thì gần như chắc chắn MAC sai — nói thẳng thay vì để người
  // dùng ngồi đoán tại sao khối trên màn hình loạn xạ.
  useEffect(() => cubeLink.on({ garbled: () => setGarbled(true) }), []);

  const connect = async () => {
    setError(null);
    setGarbled(false);
    try {
      await cubeLink.connect();
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      if (/cancel|User cancelled/i.test(msg)) return;
      setError(
        /MAC address/i.test(msg)
          ? 'Chưa có địa chỉ MAC nên không giải mã được dữ liệu cube.'
          : msg,
      );
    }
  };

  const dot =
    cubeStatus === 'connected'
      ? 'var(--color-good)'
      : cubeStatus === 'connecting'
        ? 'var(--color-warn)'
        : 'var(--color-ink-500)';

  return (
    <div className="flex flex-wrap items-center gap-3">
      {settings.keyboardCube && (
        <span className="rounded-full border border-ink-600 px-2 py-0.5 text-[12px] text-ink-300">khối ảo</span>
      )}
      {cubeStatus === 'connected' ? (
        <>
          <span className="flex items-center gap-1.5 text-[13px] text-ink-300">
            <span className="size-2 rounded-full" style={{ background: dot }} />
            {cubeInfo?.name ?? 'Cube'}
            {cubeInfo?.battery != null && <span className="tnum text-ink-400">{cubeInfo.battery}%</span>}
          </span>
          <div className="relative">
            <button
              className="btn btn-ghost !px-2 !py-1 !text-[13px]"
              onClick={() => setSyncOpen((v) => !v)}
              aria-expanded={syncOpen}
              title="App hiển thị khác khối thật?"
            >
              Đồng bộ
            </button>
            {syncOpen && (
              // Để ở thanh trên cùng nên chỗ nào trong app cũng với tới được,
              // không phải quay về trang bấm giờ mới chữa được lệch trạng thái.
              <div className="panel absolute right-0 z-50 mt-2 w-[min(92vw,26rem)] p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold">Đồng bộ với khối thật</h3>
                  <button className="btn btn-ghost !px-1.5 !py-0 !text-[13px]" onClick={() => setSyncOpen(false)}>
                    Đóng
                  </button>
                </div>
                <CubeSync />
              </div>
            )}
          </div>
          <button className="btn btn-ghost !px-2 !py-1 !text-[13px]" onClick={() => void cubeLink.disconnect()}>
            Ngắt
          </button>
        </>
      ) : (
        <button className="btn !py-1 !text-[13px]" onClick={() => void connect()} disabled={cubeStatus === 'connecting'}>
          <span className="size-2 rounded-full" style={{ background: dot }} />
          {cubeStatus === 'connecting' ? 'Đang kết nối…' : 'Kết nối smart cube'}
        </button>
      )}

      {garbled && (
        <span className="max-w-[34ch] text-[12px] text-bad">
          Dữ liệu đọc về là rác — địa chỉ MAC sai. Vào Cài đặt xoá MAC đã lưu rồi kết nối lại.
        </span>
      )}
      {error && <span className="max-w-[30ch] text-[12px] text-bad">{error}</span>}

      {macAsk && (
        <MacPrompt
          deviceName={macAsk.deviceName}
          onSubmit={(mac) => {
            macAsk.resolve(mac);
            setMacAsk(null);
          }}
          onCancel={() => {
            macAsk.resolve(null);
            setMacAsk(null);
          }}
        />
      )}
    </div>
  );
}
