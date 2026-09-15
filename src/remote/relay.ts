/**
 * The socket to the relay, and the pairing dance on top of it.
 *
 * One side asks for a room and is given a code; the other side types that code
 * in. After that the relay is a pipe: whatever one side sends, the other
 * receives. It never inspects the contents.
 */

import type { BridgeMessage, FromRelay, ToRelay } from './protocol';

export type RelayStatus =
  /** Nothing going on */
  | 'idle'
  /** Opening the socket */
  | 'connecting'
  /** In a room, waiting for the other side */
  | 'waiting'
  /** Both sides present */
  | 'linked'
  /** Gave up; `error` says why */
  | 'error';

interface Listener {
  status?: (s: RelayStatus, code: string | null, error: string | null) => void;
  message?: (m: BridgeMessage) => void;
}

/** Where the relay lives. Same host as the app, so it inherits the certificate. */
export function relayUrl(): string {
  const override = import.meta.env?.VITE_RELAY_URL;
  if (override) return override;
  if (typeof location === 'undefined') return 'ws://localhost:8787';
  // The dev server does not proxy, so talk to the relay directly there
  if (location.port === '5173') return `ws://${location.hostname}:8787`;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/relay`;
}

export class RelayLink {
  status: RelayStatus = 'idle';
  code: string | null = null;
  error: string | null = null;
  /** True once the other side has been seen, so a drop is worth retrying */
  private wasLinked = false;
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private retries = 0;
  private retryTimer: number | null = null;
  private role: 'host' | 'join' | null = null;
  private kind: 'bridge' | 'stream' = 'bridge';

  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private set(status: RelayStatus, error: string | null = null) {
    this.status = status;
    this.error = error;
    for (const l of [...this.listeners]) {
      try {
        l.status?.(status, this.code, error);
      } catch {
        /* a listener must not take the socket down */
      }
    }
  }

  /**
   * Ask for a room and a code to read out.
   *
   * `kind` says what the room is for, and the relay caps the listeners
   * accordingly: a bridge takes exactly one phone, because a second would put
   * two cubes into one app, while a stream overlay is several read-only blocks
   * and each is its own socket.
   */
  host(kind: 'bridge' | 'stream' = 'bridge') {
    this.role = 'host';
    this.kind = kind;
    this.code = null;
    this.open();
  }

  /** Join the room whose code was read out. */
  join(code: string) {
    this.role = 'join';
    this.code = code;
    this.open();
  }

  private open() {
    this.closeSocket();
    this.set('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(relayUrl());
    } catch (err) {
      this.set('error', (err as Error)?.message ?? 'Could not reach the relay');
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.retries = 0;
      this.send(this.role === 'host' ? { t: 'host', kind: this.kind } : { t: 'join', code: this.code! });
    };

    ws.onmessage = (ev) => {
      let msg: FromRelay;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      switch (msg.t) {
        case 'code':
          this.code = msg.code;
          this.set('waiting');
          break;
        case 'joined':
          this.code = msg.code;
          this.set('waiting');
          break;
        case 'peer':
          this.wasLinked = this.wasLinked || msg.up;
          this.set(msg.up ? 'linked' : 'waiting');
          break;
        case 'msg':
          for (const l of [...this.listeners]) {
            try {
              l.message?.(msg.data as BridgeMessage);
            } catch {
              /* one bad handler must not stop the stream */
            }
          }
          break;
        case 'error':
          this.set('error', msg.reason);
          this.closeSocket();
          break;
      }
    };

    ws.onclose = () => {
      if (this.status === 'error' || this.role === null) return;
      // A phone locking its screen kills the socket. The relay holds the room
      // open for a minute, so getting back in is usually just a reconnect.
      if (this.wasLinked && this.retries < 5) {
        this.retries++;
        this.set('connecting');
        this.retryTimer = window.setTimeout(() => this.open(), 500 * this.retries);
      } else {
        this.set('error', 'Connection to the relay was lost');
      }
    };

    ws.onerror = () => {
      // onclose always follows, and carries the retry logic
    };
  }

  private send(m: ToRelay) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  /** Pass something to the other side. */
  post(data: BridgeMessage) {
    this.send({ t: 'msg', data });
  }

  private closeSocket() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    try {
      ws.close();
    } catch {
      /* already gone */
    }
  }

  stop() {
    this.role = null;
    this.wasLinked = false;
    this.retries = 0;
    this.closeSocket();
    this.code = null;
    this.set('idle');
  }
}

export const relay = new RelayLink();
