import type { GameEvent } from '@sharping/shared';
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

export type LiveEventListener = (e: GameEvent) => void;

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

  /** Bumped by submit so a taste finishing afterwards doesn't resurrect stale output. */
  let submitEpoch = 0;
  const set = store.setState;
  const liveListeners = new Set<LiveEventListener>();
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
        set((s) => ({ ...s, actionError: 'Esa partida ya no existe o tu sesión expiró.' }));
      } else {
        set((s) => ({ ...s, actionError: `No se pudo cargar la partida: ${msg(e)}` }));
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

  /**
   * Fires `liveListeners` for every event the reducer applied because of `incoming` (the event itself and any
   * buffered ones it unblocked), in seq order. Events replayed from a snapshot never come through here.
   */
  function emitApplied(before: ReturnType<typeof store.getState>, incoming: GameEvent) {
    if (!liveListeners.size || !before.synced || before.lastSeq === null) return;
    const after = store.getState();
    if (after.lastSeq === null || after.lastSeq === before.lastSeq) return;
    const bySeq = new Map<number, GameEvent>();
    for (const e of [...before.buffer, incoming]) bySeq.set(e.seq, e);
    const applied = [...bySeq.values()]
      .filter((e) => e.seq > before.lastSeq! && e.seq <= after.lastSeq!)
      .sort((a, b) => a.seq - b.seq);
    for (const e of applied) {
      for (const l of [...liveListeners]) {
        try {
          l(e);
        } catch (err) {
          console.error('live event listener failed', err);
        }
      }
    }
  }

  function open(session: { code: string; playerId: string; playerToken: string; nickname: string }) {
    leave(false);
    token = session.playerToken;
    nickname = session.nickname;
    sessions.save(session);
    set(() => ({ ...initialState(), code: session.code, playerId: session.playerId }));
    channel = realtime.subscribe(session.code, {
      onEvent: (e) => {
        const before = store.getState();
        set((s) => receiveEvent(s, e));
        emitApplied(before, e);
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
        tasteResult: s.tasteResult?.orderId === orderId ? s.tasteResult : null,
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
    /** Stop cooking the current order locally (it filled up or the customer left) so the player can pick another. */
    dropOrder() {
      set((s) => ({
        ...s,
        taken: null,
        lastSubmit: null,
        tasteResult: null,
        actionError: null,
        me: s.me && s.me.currentOrderId === s.taken?.orderId ? { ...s.me, currentOrderId: null } : s.me,
      }));
    },
    async submit(source: string) {
      const taken = store.getState().taken;
      if (!taken) return;
      submitEpoch++;
      set((s) => ({ ...s, submitting: true, tasteResult: null }));
      const result = await guarded(() => api.submit(code(), taken.orderId, source, token!));
      set((s) => ({
        ...s,
        submitting: false,
        lastSubmit: result ? { orderId: taken.orderId, result } : s.lastSubmit,
        me: result?.passed && s.me ? { ...s.me, solved: result.solved } : s.me,
      }));
    },
    /** Free run of the public cases. One at a time; a second call while one is in flight is ignored. */
    async taste(source: string) {
      const s0 = store.getState();
      if (!s0.taken || s0.tasting) return;
      const orderId = s0.taken.orderId;
      const epoch = submitEpoch;
      set((s) => ({ ...s, tasting: true }));
      const result = await guarded(() => api.taste(code(), orderId, source, token!));
      set((s) => ({
        ...s,
        tasting: false,
        tasteResult: result && epoch === submitEpoch && s.taken?.orderId === orderId ? { orderId, result } : s.tasteResult,
      }));
    },
    sabotage: (targetPlayerId: string) => guarded(() => api.sabotage(code(), targetPlayerId, token!)),
    /** Subscribes to events as the reducer applies them live (one-shot FX). Not called for snapshot replays. */
    onLiveEvent(listener: LiveEventListener): () => void {
      liveListeners.add(listener);
      return () => void liveListeners.delete(listener);
    },
    dismissToast: (id: string) => set((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) })),
    get nickname() {
      return nickname;
    },
  };
}
