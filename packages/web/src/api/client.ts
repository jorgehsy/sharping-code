import {
  PLAYER_TOKEN_HEADER,
  type CreateGameResponse,
  type GameSnapshot,
  type JoinGameResponse,
  type SubmitResponse,
  type TasteResponse,
  type TakeOrderResponse,
} from '@sharping/shared';

/** Port used by the game controller. The real impl is HTTP; the mock decorates it. */
export interface GameApi {
  createGame(nickname: string): Promise<CreateGameResponse>;
  joinGame(code: string, nickname: string): Promise<JoinGameResponse>;
  getSnapshot(code: string, token: string): Promise<GameSnapshot>;
  startGame(code: string, token: string): Promise<void>;
  takeOrder(code: string, orderId: string, token: string): Promise<TakeOrderResponse>;
  submit(code: string, orderId: string, source: string, token: string): Promise<SubmitResponse>;
  taste(code: string, orderId: string, source: string, token: string): Promise<TasteResponse>;
  sabotage(code: string, targetPlayerId: string, token: string): Promise<void>;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface HttpApiOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

export function createHttpApi({ baseUrl, fetch: f = globalThis.fetch.bind(globalThis) }: HttpApiOptions): GameApi {
  async function request<T>(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (opts.token) headers[PLAYER_TOKEN_HEADER] = opts.token;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    let res: Response;
    try {
      res = await f(`${baseUrl}${path}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
    } catch (e) {
      throw new ApiRequestError(0, e instanceof Error ? e.message : 'Error de red');
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    if (!res.ok) {
      const msg = (json as { message?: unknown } | undefined)?.message;
      throw new ApiRequestError(res.status, typeof msg === 'string' ? msg : `HTTP ${res.status}`);
    }
    return json as T;
  }

  const game = (code: string) => `/games/${encodeURIComponent(code)}`;
  const order = (code: string, id: string) => `${game(code)}/orders/${encodeURIComponent(id)}`;

  return {
    createGame: (nickname) => request('POST', '/games', { body: { nickname } }),
    joinGame: (code, nickname) => request('POST', `${game(code)}/players`, { body: { nickname } }),
    getSnapshot: (code, token) => request('GET', game(code), { token }),
    startGame: async (code, token) => void (await request('POST', `${game(code)}/start`, { token })),
    takeOrder: (code, id, token) => request('POST', `${order(code, id)}/take`, { token }),
    submit: (code, id, source, token) => request('POST', `${order(code, id)}/submit`, { token, body: { source } }),
    taste: (code, id, source, token) => request('POST', `${order(code, id)}/taste`, { token, body: { source } }),
    sabotage: async (code, targetPlayerId, token) =>
      void (await request('POST', `${game(code)}/sabotages`, { token, body: { targetPlayerId } })),
  };
}
