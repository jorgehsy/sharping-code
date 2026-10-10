import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRealtime, type ConnectionStatus, type WebSocketLike } from './client.ts';
import { parseGameEvent, parseServerMessage } from './protocol.ts';

class FakeSocket implements WebSocketLike {
  onopen: WebSocketLike['onopen'] = null;
  onmessage: WebSocketLike['onmessage'] = null;
  onclose: WebSocketLike['onclose'] = null;
  onerror: WebSocketLike['onerror'] = null;
  sent: any[] = [];
  closed = false;
  constructor(readonly url: string, readonly protocols: string[]) {}
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() { this.closed = true; }
  open() { this.onopen?.({}); }
  recv(m: unknown) { this.onmessage?.({ data: typeof m === 'string' ? m : JSON.stringify(m) }); }
}

const setup = () => {
  const sockets: FakeSocket[] = [];
  const events: any[] = [];
  const statuses: ConnectionStatus[] = [];
  let subscribed = 0;
  const rt = createRealtime({
    realtimeDns: 'rt.example.com',
    httpDns: 'http.example.com',
    apiKey: 'da2-key',
    createSocket: (u, p) => { const s = new FakeSocket(u, p); sockets.push(s); return s; },
    backoffMs: () => 1000,
    newId: () => 'sub-1',
  });
  const ch = rt.subscribe('ABCDE', {
    onEvent: (e) => events.push(e),
    onStatus: (s) => statuses.push(s),
    onSubscribed: () => subscribed++,
  });
  return { sockets, events, statuses, ch, subscribed: () => subscribed };
};

/** Drive a socket through the full handshake. */
const handshake = (s: FakeSocket, timeoutMs = 60_000) => {
  s.open();
  s.recv({ type: 'connection_ack', connectionTimeoutMs: timeoutMs });
  s.recv({ type: 'subscribe_success', id: 'sub-1' });
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('realtime client', () => {
  it('connects with API-key subprotocols, inits, subscribes to the game channel', () => {
    const { sockets, statuses, subscribed } = setup();
    const s = sockets[0]!;
    expect(s.url).toBe('wss://rt.example.com/event/realtime');
    expect(s.protocols[0]).toBe('aws-appsync-event-ws');
    const hdr = JSON.parse(atob(s.protocols[1]!.replace('header-', '').replace(/-/g, '+').replace(/_/g, '/')));
    expect(hdr).toEqual({ host: 'http.example.com', 'x-api-key': 'da2-key' });

    s.open();
    expect(s.sent[0]).toEqual({ type: 'connection_init' });
    s.recv({ type: 'connection_ack', connectionTimeoutMs: 60000 });
    expect(s.sent[1]).toEqual({
      type: 'subscribe',
      id: 'sub-1',
      channel: '/game/ABCDE',
      authorization: { host: 'http.example.com', 'x-api-key': 'da2-key' },
    });
    s.recv({ type: 'subscribe_success', id: 'sub-1' });
    expect(statuses).toEqual(['connecting', 'live']);
    expect(subscribed()).toBe(1);
  });

  it('delivers data frames as GameEvents and ignores junk', () => {
    const { sockets, events } = setup();
    const s = sockets[0]!;
    handshake(s);
    const e = { type: 'rush.started', seq: 7, at: 123, data: {} };
    s.recv({ type: 'data', id: 'sub-1', event: JSON.stringify(e) });
    s.recv({ type: 'data', id: 'other', event: JSON.stringify(e) });
    s.recv({ type: 'data', id: 'sub-1', event: 'not json' });
    s.recv({ type: 'data', id: 'sub-1', event: JSON.stringify({ type: 'x' }) });
    s.recv('garbage{');
    s.recv({ type: 'ka' });
    expect(events).toEqual([e]);
  });

  it('reconnects with backoff when the keep-alive times out, and resubscribes', () => {
    const { sockets, statuses, subscribed } = setup();
    handshake(sockets[0]!, 5000);
    vi.advanceTimersByTime(4000);
    sockets[0]!.recv({ type: 'ka' }); // resets the watchdog
    vi.advanceTimersByTime(4000);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1500); // 5s since last ka
    expect(sockets[0]!.closed).toBe(true);
    expect(statuses.at(-1)).toBe('reconnecting');
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
    handshake(sockets[1]!);
    expect(subscribed()).toBe(2);
    expect(statuses.at(-1)).toBe('live');
  });

  it('reconnects when the socket closes, with growing attempts reset on success', () => {
    const { sockets } = setup();
    sockets[0]!.onclose?.({});
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
    sockets[1]!.onclose?.({});
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(3);
  });

  it('reconnects on subscribe_error', () => {
    const { sockets } = setup();
    sockets[0]!.open();
    sockets[0]!.recv({ type: 'subscribe_error', id: 'sub-1', errors: [{ errorType: 'x' }] });
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
  });

  it('close() unsubscribes, stops reconnecting and reports closed', () => {
    const { sockets, ch, statuses } = setup();
    handshake(sockets[0]!);
    ch.close();
    expect(sockets[0]!.sent.at(-1)).toEqual({ type: 'unsubscribe', id: 'sub-1' });
    expect(sockets[0]!.closed).toBe(true);
    vi.advanceTimersByTime(600_000);
    expect(sockets).toHaveLength(1);
    expect(statuses.at(-1)).toBe('closed');
  });
});

describe('protocol parsing', () => {
  it('defaults the connection timeout', () => {
    expect(parseServerMessage('{"type":"connection_ack"}')).toEqual({ type: 'connection_ack', connectionTimeoutMs: 300000 });
  });
  it('accepts already-parsed event objects', () => {
    expect(parseGameEvent({ type: 'a', seq: 1, at: 2, data: { k: 1 } })).toEqual({ type: 'a', seq: 1, at: 2, data: { k: 1 } });
    expect(parseGameEvent({ type: 'a', seq: 1.5, at: 2 })).toBeNull();
  });
});
