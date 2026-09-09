/**
 * Xử lý địa chỉ MAC của smart cube, tách riêng khỏi phần Bluetooth để chạy được
 * cả ngoài trình duyệt (thư viện BLE không nạp được trong Node nên test sẽ vỡ).
 */

export const MAC_STORAGE_KEY = 'sct.cubeMac';

/**
 * Chuẩn hoá địa chỉ MAC: nhận mọi kiểu người ta hay gõ (có dấu hai chấm, dấu
 * gạch, khoảng trắng, hoặc dính liền) và trả về dạng AB:CD:EF:12:34:56.
 * Trả về null nếu không phải 6 byte hex.
 */
export function normalizeMac(input: string): string | null {
  const hex = input.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length !== 12) return null;
  return (hex.match(/.{2}/g) ?? []).join(':');
}

/** Danh sách MAC đã lưu, để người dùng xoá đi khi gõ nhầm. */
export function savedMacs(): { key: string; label: string; mac: string }[] {
  const out: { key: string; label: string; mac: string }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(MAC_STORAGE_KEY + '.')) continue;
    out.push({ key, label: key.slice(MAC_STORAGE_KEY.length + 1), mac: localStorage.getItem(key) ?? '' });
  }
  return out;
}

export function forgetMac(key: string): void {
  localStorage.removeItem(key);
}
