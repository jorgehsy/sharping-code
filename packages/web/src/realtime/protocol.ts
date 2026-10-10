import type { GameEvent } from '@sharping/shared';

/** Server → client messages we care about. Everything else is ignored. */
export type ServerMessage =
  | { type: 'connection_ack'; connectionTimeoutMs: number }
  | { type: 'ka' }
  | { type: 'subscribe_success'; id: string }
  | { type: 'subscribe_error' | 'error'; detail: string }
  | { type: 'data'; id: string; event: unknown };

const DEFAULT_TIMEOUT_MS = 300_000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Defensive parse of a raw WS frame. Returns null for anything unusable. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string') return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(m) || typeof m.type !== 'string') return null;
  switch (m.type) {
    case 'connection_ack': {
      const t = m.connectionTimeoutMs;
      return { type: 'connection_ack', connectionTimeoutMs: typeof t === 'number' && t > 0 ? t : DEFAULT_TIMEOUT_MS };
    }
    case 'ka':
      return { type: 'ka' };
    case 'subscribe_success':
      return typeof m.id === 'string' ? { type: 'subscribe_success', id: m.id } : null;
    case 'subscribe_error':
    case 'error':
      return { type: m.type, detail: JSON.stringify(m.errors ?? m) };
    case 'data':
      return typeof m.id === 'string' ? { type: 'data', id: m.id, event: m.event } : null;
    default:
      return null;
  }
}

/** AppSync sends event payloads as JSON strings (sometimes already parsed). Validates the envelope only. */
export function parseGameEvent(payload: unknown): GameEvent | null {
  let e = payload;
  if (typeof e === 'string') {
    try {
      e = JSON.parse(e);
    } catch {
      return null;
    }
  }
  if (!isObj(e)) return null;
  const { type, seq, at, data } = e;
  if (typeof type !== 'string' || !Number.isInteger(seq) || typeof at !== 'number') return null;
  return { type, seq, at, data: isObj(data) ? data : {} } as GameEvent;
}

const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export interface AuthHeaders {
  host: string;
  'x-api-key': string;
}

export const authHeaders = (httpDns: string, apiKey: string): AuthHeaders => ({ host: httpDns, 'x-api-key': apiKey });

export const wsProtocols = (auth: AuthHeaders) => ['aws-appsync-event-ws', `header-${b64url(JSON.stringify(auth))}`];
