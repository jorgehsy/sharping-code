import { ApiRequestError, type GameApi } from '../api/client.ts';
import type { Realtime } from '../realtime/client.ts';
import { MockOrders } from './orders.ts';

/**
 * The only entry points of the mock. Used by app/wire.ts when VITE_MOCK_ORDERS=true.
 * Both wrappers share one MockOrders; everything else in the app is unaware of it.
 */
export function withMockOrders(api: GameApi, realtime: Realtime, mock = new MockOrders({ bots: 7, openTarget: 5 })): { api: GameApi; realtime: Realtime } {
  // One monotone seq over real + fake events (their own seqs would interleave and look like gaps).
  // Shared with the snapshot so `snapshot.seq` is consistent with what the stream stamps.
  let seq = 0;
  const wrap = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (e) {
      const status = (e as { status?: number }).status;
      throw status ? new ApiRequestError(status, (e as Error).message) : e;
    }
  };

  const mockedApi: GameApi = {
    ...api,
    async getSnapshot(code, token) {
      const real = await api.getSnapshot(code, token);
      const snap = { ...real, seq };
      mock.observe(snap);
      if (snap.status === 'running' && snap.startedAt && snap.rushAt && snap.endsAt) {
        mock.ensureRunning({ startedAt: snap.startedAt, rushAt: snap.rushAt, endsAt: snap.endsAt });
        const { players, me } = mock.decorate(snap);
        return { ...snap, players, me, orders: mock.orders() };
      }
      return snap;
    },
    takeOrder: async (_c, orderId) => wrap(() => mock.take(orderId)),
    submit: async (_c, orderId, source) => wrap(() => mock.submit(orderId, source)),
    taste: async (_c, orderId, source) => wrap(() => mock.taste(orderId, source)),
    sabotage: async (_c, target) => wrap(() => mock.sabotage(target)),
  };

  const mockedRealtime: Realtime = {
    subscribe(code, h) {
      const stamp = (e: Omit<Parameters<typeof h.onEvent>[0], 'seq'>) => h.onEvent({ ...e, seq: ++seq } as never);
      const off = mock.onEvent(stamp);
      const timer = setInterval(() => mock.advance(), 1000);
      const ch = realtime.subscribe(code, {
        ...h,
        onEvent(e) {
          if (e.type === 'game.started') mock.ensureRunning(e.data as { startedAt: number; rushAt: number; endsAt: number });
          // The real clock still rotates real orders; in mock mode orders are the mock's only (as in the snapshot).
          if (e.type === 'order.opened' || e.type === 'order.expired') return;
          stamp(e);
        },
      });
      return {
        close() {
          off();
          clearInterval(timer);
          ch.close();
        },
      };
    },
  };

  return { api: mockedApi, realtime: mockedRealtime };
}
