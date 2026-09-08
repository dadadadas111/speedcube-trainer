import { useRef, useState } from 'react';
import { useApp } from '../store/app';
import { exportAll, importAll, db } from '../store/db';
import { KEYMAP_HELP } from '../smartcube/virtual';
import { cubeLink } from '../smartcube/connection';

export default function SettingsPage() {
  const { settings, updateSettings, sessions, sessionId, addSession, renameSession, deleteSession, setSession, bump } = useApp();
  const [newSession, setNewSession] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    const data = await exportAll();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `speedcube-trainer-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async (file: File) => {
    try {
      await importAll(JSON.parse(await file.text()));
      bump();
      setMessage('Đã nhập xong. Tải lại trang để thấy đầy đủ.');
    } catch (e) {
      setMessage(`Không nhập được: ${(e as Error).message}`);
    }
  };

  const wipe = async () => {
    if (!confirm('Xoá toàn bộ solve, alg và lần drill? Không khôi phục được.')) return;
    await Promise.all([db.solves.clear(), db.reps.clear(), db.algs.clear()]);
    bump();
    setMessage('Đã xoá sạch dữ liệu.');
  };

  return (
    <div className="flex max-w-[820px] flex-col gap-5">
      <section className="panel p-5">
        <h2 className="text-base font-semibold">Phiên tập</h2>
        <p className="mt-1 text-[13px] text-ink-400">Tách phiên để so sánh, ví dụ một phiên riêng khi đang tập kỹ thuật mới.</p>
        <div className="mt-4 flex flex-col gap-2">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <input
                className="input flex-1"
                value={s.name}
                onChange={(e) => s.id && void renameSession(s.id, e.target.value)}
              />
              <button
                className={`btn !py-1.5 ${sessionId === s.id ? '!border-cube-blue !text-cube-blue' : ''}`}
                onClick={() => s.id && void setSession(s.id)}
              >
                {sessionId === s.id ? 'Đang dùng' : 'Chọn'}
              </button>
              <button
                className="btn btn-danger !py-1.5"
                disabled={sessions.length <= 1}
                onClick={() => s.id && confirm(`Xoá phiên "${s.name}" cùng toàn bộ solve trong đó?`) && void deleteSession(s.id)}
              >
                Xoá
              </button>
            </div>
          ))}
          <div className="mt-1 flex gap-2">
            <input
              className="input flex-1"
              placeholder="Tên phiên mới"
              value={newSession}
              onChange={(e) => setNewSession(e.target.value)}
            />
            <button
              className="btn"
              disabled={!newSession.trim()}
              onClick={() => {
                void addSession(newSession.trim());
                setNewSession('');
              }}
            >
              Tạo phiên
            </button>
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-base font-semibold">Bấm giờ</h2>
        <div className="mt-4 flex flex-col gap-3">
          <Row label="Phương pháp phân tích" hint="Quyết định app tách solve thành những bước nào.">
            <select
              className="input max-w-[180px]"
              value={settings.method}
              onChange={(e) => void updateSettings({ method: e.target.value as 'roux' | 'cfop' | 'auto' })}
            >
              <option value="roux">Roux</option>
              <option value="cfop">CFOP</option>
              <option value="auto">Tự nhận</option>
            </select>
          </Row>
          <Toggle
            label="Bắt khối phải khớp scramble"
            hint="Đồng hồ chỉ sẵn sàng khi khối thật đã đúng scramble."
            value={settings.requireScrambleMatch}
            onChange={(v) => void updateSettings({ requireScrambleMatch: v })}
          />
          <Toggle
            label="Bật inspection"
            hint="Đếm ngược sau khi khối khớp scramble. Nước đầu tiên bắt đầu tính giờ."
            value={settings.useInspection}
            onChange={(v) => void updateSettings({ useInspection: v })}
          />
          <Toggle
            label="Scramble random-state"
            hint="Chuẩn WCA. Tắt đi nếu máy yếu — khi đó dùng scramble ngẫu nhiên theo nước."
            value={settings.randomStateScramble}
            onChange={(v) => void updateSettings({ randomStateScramble: v })}
          />
          <Toggle
            label="Khối ảo bằng bàn phím"
            hint="Dùng thử app khi chưa pair smart cube."
            value={settings.keyboardCube}
            onChange={(v) => void updateSettings({ keyboardCube: v })}
          />
          {settings.keyboardCube && (
            <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
              <p className="mb-2 text-[13px] text-ink-300">Giữ Shift để thành nước 180 (ví dụ Shift+i = R2).</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
                {KEYMAP_HELP.map(([k, v]) => (
                  <div key={k} className="flex justify-between font-mono text-[13px]">
                    <span className="text-ink-400">{k}</span>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-base font-semibold">Cách tính "đứng yên"</h2>
        <p className="mt-1 max-w-[65ch] text-[13px] text-ink-400">
          Một khoảng nghỉ được tính là đứng yên khi nó vừa dài hơn ngưỡng cố định, vừa dài hơn một bội số của
          khoảng cách trung vị giữa hai nước trong chính solve đó. Nhờ vậy ngưỡng tự co giãn theo tốc độ của bạn.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="pmin">
              Ngưỡng tối thiểu: {settings.pauseMinMs}ms
            </label>
            <input
              id="pmin"
              type="range"
              min={80}
              max={500}
              step={10}
              value={settings.pauseMinMs}
              onChange={(e) => void updateSettings({ pauseMinMs: Number(e.target.value) })}
              className="w-full"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="pfac">
              Bội số trung vị: {settings.pauseFactor.toFixed(1)}×
            </label>
            <input
              id="pfac"
              type="range"
              min={1.4}
              max={4}
              step={0.1}
              value={settings.pauseFactor}
              onChange={(e) => void updateSettings({ pauseFactor: Number(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-base font-semibold">Dữ liệu</h2>
        <p className="mt-1 max-w-[65ch] text-[13px] text-ink-400">
          Toàn bộ dữ liệu nằm trong trình duyệt trên máy bạn, không gửi đi đâu cả. Xoá dữ liệu trình duyệt là mất,
          nên thỉnh thoảng hãy xuất file sao lưu.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn" onClick={() => void doExport()}>
            Xuất file sao lưu
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Nhập từ file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => e.target.files?.[0] && void doImport(e.target.files[0])}
          />
          <button className="btn btn-danger" onClick={() => void wipe()}>
            Xoá sạch dữ liệu
          </button>
        </div>
        {message && <p className="mt-3 text-sm text-warn">{message}</p>}
      </section>

      <section className="panel p-5">
        <h2 className="text-base font-semibold">Smart cube</h2>
        <p className="mt-1 max-w-[65ch] text-[13px] text-ink-400">
          Hỗ trợ GAN Gen2/Gen3/Gen4 qua Web Bluetooth. Cần Chrome hoặc Edge — Safari và iOS không chạy được
          Web Bluetooth.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
          <span className="text-ink-400">
            Trình duyệt {typeof navigator !== 'undefined' && 'bluetooth' in navigator ? 'có' : 'không'} hỗ trợ Web Bluetooth
          </span>
          {cubeLink.info && (
            <span className="font-mono text-ink-300">
              {cubeLink.info.name} · {cubeLink.info.hardware ?? '?'} · pin {cubeLink.info.battery ?? '?'}%
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="max-w-[46ch]">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-[13px] text-ink-400">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row label={label} hint={hint}>
      <button
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
        style={{ background: value ? 'var(--color-cube-blue)' : 'var(--color-ink-600)' }}
      >
        <span
          className="absolute top-0.5 size-5 rounded-full bg-white transition-[left]"
          style={{ left: value ? '1.375rem' : '0.125rem' }}
        />
      </button>
    </Row>
  );
}
