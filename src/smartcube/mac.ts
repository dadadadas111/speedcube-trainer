/**
 * Smart cube MAC handling, kept separate from the Bluetooth code so it runs
 * outside a browser too (the BLE library will not load in Node, breaking tests).
 */

export const MAC_STORAGE_KEY = 'sct.cubeMac';

/**
 * Normalise a MAC address: accept every way people type it (colons, dashes,
 * spaces, or run together) and return AB:CD:EF:12:34:56 form.
 * Returns null if it is not 6 hex bytes.
 */
export function normalizeMac(input: string): string | null {
  const hex = input.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length !== 12) return null;
  return (hex.match(/.{2}/g) ?? []).join(':');
}

/** The saved MAC addresses, so the user can delete a mistyped one. */
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
