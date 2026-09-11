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

/**
 * Every key a cube's MAC might be filed under.
 *
 * Chrome does not always report a device name — the chooser can hand back a
 * device whose `name` is undefined, and the same cube then hashes to a
 * different storage key than the one its MAC was saved under. Looking under
 * both the name and the per-origin device id makes a saved MAC findable
 * whichever way this particular connection happened to go, which matters a
 * great deal: without it the library falls back to watchAdvertisements and
 * spends ten seconds waiting for a cube that has already stopped advertising.
 */
export function macKeysFor(name?: string | null, id?: string | null): string[] {
  const keys: string[] = [];
  for (const part of [name, id]) {
    if (!part) continue;
    const key = `${MAC_STORAGE_KEY}.${part}`;
    if (!keys.includes(key)) keys.push(key);
  }
  if (!keys.length) keys.push(`${MAC_STORAGE_KEY}.cube`);
  return keys;
}

/** The saved MAC for this cube, looked up under every name it may be filed by. */
export function recallMac(name?: string | null, id?: string | null): string | null {
  for (const key of macKeysFor(name, id)) {
    const saved = localStorage.getItem(key);
    if (saved) return saved;
  }
  return null;
}

/**
 * File a MAC under every key this cube could later be recognised by, so the
 * next connection finds it even if Chrome reports the device differently.
 */
export function rememberMac(mac: string, name?: string | null, id?: string | null): void {
  for (const key of macKeysFor(name, id)) localStorage.setItem(key, mac);
}
