import { ApiRequestError, type GameApi } from '../api/client.ts';
import type { GameChannel, Realtime } from '../realtime/client.ts';
import type { SessionStore } from '../session.ts';
import { applySnapshot, beginSync, hasOpenGap, markStale, receiveEvent } from '../store/reducer.ts';
import { initialState } from '../store/state.ts';
import type { GameStore } from '../store/store.ts';
import { clockOffset } from '../store/time.ts';

export interface ControllerDeps {
  api: GameApi;
  realtime: Realtime;
  store: GameStore;
  sessions: SessionStore;
  now?: () => number;
  /** How long a seq gap may stay open (out-of-order delivery) before refetching the snapshot. */
  gapWindowMs?: number;
}

export const GAP_WINDOW_MS = 1000;

export type GameController = ReturnType<typeof createGameController>;

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Orchestrates api + realtime + store. All I/O is injected; UI only calls these methods.
 * Ordering rule: subscribe FIRST, then fetch the snapshot. Events arriving meanwhile are buffered
 * by the reducer and replayed on top of the snapshot (see store/reducer.ts).
 */
export function createGameController({ api, realtime, store, sessions, now = Date.now, gapWindowMs = GAP_WINDOW_MS }: ControllerDeps) {
  let channel: GameChannel | null = null;
  let token: string | null = null;
  let fetchId = 0;
  /** Id of the snapshot fetch in flight (0 = none). A gap un-syncs the store while this is 0. */
  let inFlight = 0;
  let nickname = '';

  const set = store.setState;
  const code = () => store.getState().code!;

  async function refresh() {
    const id = ++fetchId;
    inFlight = id;
    set(beginSync);
    const t0 = now();
    try {
      const snap = await api.getSnapshot(code(), token!);
      if (id !== fetchId) return; // a newer refresh superseded this one
      inFlight = 0;
      const t1 = now();
      set((s) => applySnapshot(s, snap, clockOffset(snap.now, (t0 + t1) / 2)));
      afterSnapshot();
    } catch (e) {
      if (id !== fetchId) return;
      inFlight = 0;
      if (e instanceof ApiRequestError && (e.status === 401 || e.status === 403 || e.status === 404)) {
        leave();
        set((s) => ({ ...s, actionError: 'That game is gone or your session expired.' }));
      } else {
        set((s) => ({ ...s, actionError: `Could not load game: ${msg(e)}` }));
        // Transient: retry; the realtime layer also refetches on every resubscribe.
        setTimeout(() => id === fetchId && channel && void refresh(), 2000);
      }
    }
  }

  let gapTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * Reorder window: AppSync doesn't keep order within a batch, so a gap usually fills by itself.
   * Only if the same gap is still open after `gapWindowMs` do we refetch.
   */
  function watchGap() {
    const s = store.getState();
    if (!hasOpenGap(s)) {
      clearTimeout(gapTimer);
      gapTimer = undefined;
      return;
    }
    if (gapTimer) return;
    const since = s.lastSeq;
    gapTimer = setTimeout(() => {
      gapTimer = undefined;
      const cur = store.getState();
      if (!channel || !hasOpenGap(cur)) return;
      if (cur.lastSeq !== since) return watchGap(); // progress was made: new window for what's left
      set(markStale);
      if (!inFlight) void refresh();
    }, gapWindowMs);
  }

  /** A gap flips `synced` off inside the reducer; here we notice and refetch. */
  function afterSnapshot() {
    const s = store.getState();
    // Gap between snapshot and buffer (event published after the read): retry, but never spin.
    if (!s.synced) setTimeout(() => channel && !inFlight && !store.getState().synced && void refresh(), 300);
    // Reloaded mid-order: recover the statement/signature (taking the same order again is harmless).
    else if (s.me?.currentOrderId && !s.taken) void takeOrder(s.me.currentOrderId, true);
  }

  function open(session: { code: string; playerId: string; playerToken: string; nickname: string }) {
    leave(false);
    token = session.playerToken;
    nickname = session.nickname;
    sessions.save(session);
    set(() => ({ ...initialState(), code: session.code, playerId: session.playerId }));
    channel = realtime.subscribe(session.code, {
      onEvent: (e) => {
        set((s) => receiveEvent(s, e));
        watchGap();
        const s = store.getState();
        if (!s.synced && !inFlight) void refresh(); // not synced and no fetch running (e.g. earlier fetch failed)
      },
      onStatus: (connection) => set((s) => ({ ...s, connection })),
      onSubscribed: () => void refresh(),
    });
    void refresh(); // don't wait for the socket: HTTP alone must get us into the game
  }

  function leave(clearSession = true) {
    channel?.close();
    channel = null;
    token = null;
    fetchId++;
    inFlight = 0;
    clearTimeout(gapTimer);
    gapTimer = undefined;
    if (clearSession) {
      sessions.clear();
      set(() => initialState());
    }
  }

  async function guarded<T>(fn: () => Promise<T>): Promise<T | undefined> {
    set((s) => ({ ...s, actionError: null }));
    try {
      return await fn();
    } catch (e) {
      set((s) => ({ ...s, actionError: msg(e) }));
      return undefined;
    }
  }

  async function takeOrder(orderId: string, silent = false) {
    const run = async () => {
      const taken = await api.takeOrder(code(), orderId, token!);
      set((s) => ({
        ...s,
        taken,
        lastSubmit: s.lastSubmit?.orderId === orderId ? s.lastSubmit : null,
        me: s.me ? { ...s.me, currentOrderId: orderId } : s.me,
      }));
      return taken;
    };
    if (silent) return run().catch(() => undefined);
    return guarded(run);
  }

  return {
    async create(nick: string) {
      return guarded(async () => {
        const r = await api.createGame(nick);
        open({ code: r.code, playerId: r.playerId, playerToken: r.playerToken, nickname: nick });
      });
    },
    async join(gameCode: string, nick: string) {
      return guarded(async () => {
        const r = await api.joinGame(gameCode, nick);
        open({ code: gameCode, playerId: r.playerId, playerToken: r.playerToken, nickname: nick });
      });
    },
    /** Rejoin from localStorage after a reload. Returns whether a session existed. */
    resume(): boolean {
      const s = sessions.load();
      if (!s) return false;
      open(s);
      return true;
    },
    leave: () => leave(true),
    refresh: () => refresh(),
    start: () => guarded(() => api.startGame(code(), token!)),
    takeOrder: (orderId: string) => takeOrder(orderId),
    async submit(source: string) {
      const taken = store.getState().taken;
      if (!taken) return;
      set((s) => ({ ...s, submitting: true }));
      const result = await guarded(() => api.submit(code(), taken.orderId, source, token!));
      set((s) => ({
        ...s,
        submitting: false,
        lastSubmit: result ? { orderId: taken.orderId, result } : s.lastSubmit,
      }));
    },
    sabotage: (targetPlayerId: string) => guarded(() => api.sabotage(code(), targetPlayerId, token!)),
    dismissToast: (id: string) => set((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) })),
    get nickname() {
      return nickname;
    },
  };
}
