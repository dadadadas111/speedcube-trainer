/**
 * Hộp thoại xin địa chỉ MAC của cube.
 *
 * MAC là bắt buộc chứ không phải tuỳ chọn: thư viện dùng nó làm muối cho khoá
 * giải mã, không có thì mọi gói tin đọc về đều là rác. Trình duyệt chỉ tự đọc
 * được MAC qua watchAdvertisements(), mà API này trên Chrome Android nằm sau cờ
 * thử nghiệm — nên trên điện thoại thường phải nhập tay một lần.
 */

import { useEffect, useState } from 'react';
import { normalizeMac } from '../smartcube/connection';

interface Props {
  deviceName: string;
  onSubmit: (mac: string) => void;
  onCancel: () => void;
}

export default function MacPrompt({ deviceName, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState('');
  const normalized = normalizeMac(value);
  const touched = value.trim().length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mac-title"
    >
      <div className="panel w-full max-w-[520px] p-5">
        <h2 id="mac-title" className="text-base font-semibold">
          Nhập địa chỉ MAC của cube
        </h2>
        <p className="mt-1 text-[13px] text-ink-400">
          Cube: <span className="font-mono text-ink-200">{deviceName}</span>
        </p>

        <p className="mt-3 max-w-[60ch] text-sm text-ink-300">
          GAN mã hoá dữ liệu bằng khoá trộn từ chính địa chỉ MAC, nên không có MAC thì không đọc được gì.
          Trình duyệt trên điện thoại thường không cho đọc MAC tự động, phải nhập tay một lần — sau đó app nhớ luôn.
        </p>

        <label className="field-label mt-4" htmlFor="mac-input">
          Địa chỉ MAC
        </label>
        <input
          id="mac-input"
          autoFocus
          className="input font-mono"
          placeholder="AB:CD:EF:12:34:56"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && normalized) onSubmit(normalized);
          }}
        />
        {touched &&
          (normalized ? (
            <p className="mt-1.5 text-[13px] text-good">Hiểu là {normalized}</p>
          ) : (
            <p className="mt-1.5 text-[13px] text-bad">Cần đúng 6 byte hex, ví dụ AB:CD:EF:12:34:56 hoặc abcdef123456.</p>
          ))}

        <details className="mt-4 rounded-lg border border-ink-700 bg-ink-900 p-3">
          <summary className="cursor-pointer text-sm text-ink-200">Tìm MAC ở đâu?</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[13px] text-ink-300">
            <li>
              Dùng app quét Bluetooth như <span className="text-ink-100">nRF Connect</span> (Android): quét lên là
              thấy tên cube kèm địa chỉ MAC ngay bên cạnh. Cách này chắc ăn nhất.
            </li>
            <li>
              Hoặc mở app chính hãng của GAN, vào phần thông tin thiết bị đã kết nối.
            </li>
            <li>
              Muốn khỏi nhập tay: mở <span className="font-mono text-ink-100">chrome://flags</span>, bật{' '}
              <span className="text-ink-100">Experimental Web Platform features</span>, khởi động lại Chrome. Khi đó
              trình duyệt tự đọc được MAC từ tín hiệu quảng bá của cube.
            </li>
          </ul>
        </details>

        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={!normalized} onClick={() => normalized && onSubmit(normalized)}>
            Kết nối
          </button>
          <button className="btn" onClick={onCancel}>
            Huỷ
          </button>
        </div>
      </div>
    </div>
  );
}
