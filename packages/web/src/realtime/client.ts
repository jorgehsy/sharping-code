import type { GameEvent } from '@sharping/shared';
import { gameChannel } from '@sharping/shared';
import { authHeaders, parseGameEvent, parseServerMessage, wsProtocols, type AuthHeaders } from './protocol.ts';

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'closed';

export interface RealtimeHandlers {
  onEvent(event: GameEvent): void;
  onStatus(status: ConnectionStatus): void;
  /** Fired on every successful (re)subscription: the caller must refetch the snapshot. */
  onSubscribed(): void;
}

export interface GameChannel {
  close(): void;
}

/** Port: subscribe to a game's channel. */
export interface Realtime {
  subscribe(code: string, handlers: RealtimeHandlers): GameChannel;
}

/** Minimal slice of the browser WebSocket we use (lets tests inject a fake). */
export interface WebSocketLike {
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}
export type WebSocketFactory = (url: string, protocols: string[]) => WebSocketLike;

export interface RealtimeOptions {
  realtimeDns: string;
  httpDns: string;
  apiKey: string;
  createSocket?: WebSocketFactory;
  /** Reconnect delay for attempt n (0-based). */
  backoffMs?: (attempt: number) => number;
  newId?: () => string;
}

const defaultBackoff = (n: number) => Math.min(500 * 2 ** n, 10_000) * (0.75 + Math.random() * 0.5);

export function createRealtime(opts: RealtimeOptions): Realtime {
  const createSocket: WebSocketFactory = opts.createSocket ?? ((url, p) => new WebSocket(url, p) as WebSocketLike);
  const backoff = opts.backoffMs ?? defaultBackoff;
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const auth: AuthHeaders = authHeaders(opts.httpDns, opts.apiKey);
  const url = `wss://${opts.realtimeDns}/event/realtime`;

  return {
    subscribe(code, h) {
      const channel = gameChannel(code);
      let ws: WebSocketLike | null = null;
      let closed = false;
      let attempt = 0;
      let subId = '';
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      let retry: ReturnType<typeof setTimeout> | undefined;
      let timeoutMs = 300_000;
      let hadLive = false;

      const clearTimers = () => {
        clearTimeout(watchdog);
        clearTimeout(retry);
      };
      const armWatchdog = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => drop(ws), timeoutMs);
      };

      /** Tear down `sock` and schedule a reconnect (no-op if a newer socket replaced it). */
      function drop(sock: WebSocketLike | null) {
        if (closed || !sock || sock !== ws) return;
        clearTimers();
        sock.onopen = sock.onmessage = sock.onclose = sock.onerror = null;
        try {
          sock.close();
        } catch {
          /* already closed */
        }
        ws = null;
        h.onStatus('reconnecting');
        retry = setTimeout(connect, backoff(attempt++));
      }

      function connect() {
        if (closed) return;
        h.onStatus(hadLive ? 'reconnecting' : 'connecting');
        const sock = createSocket(url, wsProtocols(auth));
        ws = sock;
        sock.onopen = () => sock.send(JSON.stringify({ type: 'connection_init' }));
        sock.onerror = () => {}; // close follows
        sock.onclose = () => drop(sock);
        sock.onmessage = (ev) => {
          const msg = parseServerMessage(ev.data);
          if (!msg) return;
          armWatchdog();
          switch (msg.type) {
            case 'connection_ack':
              timeoutMs = msg.connectionTimeoutMs;
              armWatchdog();
              subId = newId();
              sock.send(JSON.stringify({ type: 'subscribe', id: subId, channel, authorization: auth }));
              break;
            case 'subscribe_success':
              if (msg.id !== subId) break;
              attempt = 0;
              hadLive = true;
              h.onStatus('live');
              h.onSubscribed();
              break;
            case 'subscribe_error':
            case 'error':
              drop(sock);
              break;
            case 'data': {
              if (msg.id !== subId) break;
              const event = parseGameEvent(msg.event);
              if (event) h.onEvent(event);
              break;
            }
            case 'ka':
              break;
          }
        };
      }

      connect();
      return {
        close() {
          if (closed) return;
          closed = true;
          clearTimers();
          if (ws) {
            const s = ws;
            ws = null;
            s.onopen = s.onmessage = s.onclose = s.onerror = null;
            try {
              if (subId) s.send(JSON.stringify({ type: 'unsubscribe', id: subId }));
              s.close();
            } catch {
              /* ignore */
            }
          }
          h.onStatus('closed');
        },
      };
    },
  };
}
