import { useState } from 'react';
import { useApp } from '../store/app';
import { cubeLink } from '../smartcube/connection';

export default function CubeStatus() {
  const { cubeStatus, cubeInfo, settings } = useApp();
  const [error, setError] = useState<string | null>(null);

  cubeLink.askForMac = async (deviceName) =>
    window.prompt(
      `Không tự đọc được địa chỉ MAC của "${deviceName}".\n\nNhập MAC in trên hộp hoặc trong app GAN (dạng AB:CD:EF:12:34:56):`,
    );

  const connect = async () => {
    setError(null);
    try {
      await cubeLink.connect();
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      setError(/cancel|User cancelled/i.test(msg) ? null : msg);
    }
  };

  const dot =
    cubeStatus === 'connected' ? 'var(--color-good)' : cubeStatus === 'connecting' ? 'var(--color-warn)' : 'var(--color-ink-500)';

  return (
    <div className="flex items-center gap-3">
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
          <button className="btn btn-ghost !px-2 !py-1 !text-[13px]" onClick={() => void cubeLink.resync()} title="Đồng bộ lại trạng thái khối">
            Đồng bộ
          </button>
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
      {error && <span className="max-w-[26ch] text-[12px] text-bad">{error}</span>}
    </div>
  );
}
