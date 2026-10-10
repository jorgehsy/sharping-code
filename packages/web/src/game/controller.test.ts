import type { GameEvent, GameSnapshot } from '@sharping/shared';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, type GameApi } from '../api/client.ts';
import type { RealtimeHandlers } from '../realtime/client.ts';
import { createSessionStore } from '../session.ts';
import { createGameStore } from '../store/store.ts';
import { ev, snapshot } from '../store/testing.ts';
import { createGameController } from './controller.ts';

const memStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

function setup(getSnapshot: () => Promise<GameSnapshot>, gapWindowMs = 30) {
  const store = createGameStore();
  const sessions = createSessionStore(memStorage());
  let handlers!: RealtimeHandlers;
  const closed = vi.fn();
  const api = {
    createGame: async () => ({ code: 'ABCDE', playerId: 'p1', playerToken: 'tok' }),
    joinGame: async () => ({ playerId: 'p2', playerToken: 'tok2' }),
    getSnapshot: vi.fn(getSnapshot),
    startGame: vi.fn(async () => {}),
    takeOrder: vi.fn(),
    submit: vi.fn(),
    sabotage: vi.fn(),
  } as unknown as GameApi;
  const controller = createGameController({
    api,
    store,
    sessions,
    gapWindowMs,
    realtime: { subscribe: (_c, h) => ((handlers = h), { close: closed }) },
  });
  return { store, controller, api, sessions, closed, h: () => handlers };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('game controller', () => {
  it('create: persists session, subscribes first, then loads snapshot', async () => {
    const t = setup(async () => snapshot({ status: 'lobby' }));
    await t.controller.create('Ana');
    await tick();
    expect(t.sessions.load()).toMatchObject({ code: 'ABCDE', playerToken: 'tok', nickname: 'Ana' });
    expect(t.store.getState()).toMatchObject({ code: 'ABCDE', synced: true, status: 'lobby' });
  });

  it('events arriving while the snapshot is in flight are buffered and replayed (not lost)', async () => {
    let release!: (s: GameSnapshot) => void;
    const t = setup(() => new Promise((r) => (release = r)));
    await t.controller.create('Ana');
    t.h().onEvent(ev('player.joined', 7, { playerId: 'p3', nickname: 'Cy' }, 2000));
    t.h().onEvent(ev('rush.started', 6, {}, 1900)); // already in the snapshot
    expect(t.store.getState().players).toEqual([]);
    release(snapshot({ seq: 6 }));
    await tick();
    expect(t.store.getState().players.map((p) => p.nickname)).toEqual(['Ana', 'Bo', 'Cy']);
  });

  it('an out-of-order batch fills within the window: no refetch', async () => {
    const t = setup(async () => snapshot({ seq: 3 }));
    await t.controller.create('Ana');
    await tick();
    const calls = vi.mocked(t.api.getSnapshot).mock.calls.length;
    for (const seq of [5, 4, 7, 6]) t.h().onEvent(ev('player.joined', seq, { playerId: `x${seq}`, nickname: `N${seq}` }));
    await new Promise((r) => setTimeout(r, 60));
    expect(t.api.getSnapshot).toHaveBeenCalledTimes(calls);
    expect(t.store.getState()).toMatchObject({ synced: true, lastSeq: 7 });
    expect(t.store.getState().players).toHaveLength(6);
  });

  it('a gap still open after the window refetches exactly once', async () => {
    let seq = 3;
    const t = setup(async () => snapshot({ seq }));
    await t.controller.create('Ana');
    await tick();
    const calls = vi.mocked(t.api.getSnapshot).mock.calls.length;
    t.h().onEvent(ev('rush.started', 4, {}));
    t.h().onEvent(ev('player.joined', 7, { playerId: 'p9', nickname: 'Z' })); // 5, 6 never arrive
    t.h().onEvent(ev('player.joined', 8, { playerId: 'p8', nickname: 'Y' }));
    expect(t.api.getSnapshot).toHaveBeenCalledTimes(calls); // waiting, not refetching yet
    seq = 6;
    await new Promise((r) => setTimeout(r, 80));
    expect(t.api.getSnapshot).toHaveBeenCalledTimes(calls + 1);
    expect(t.store.getState()).toMatchObject({ synced: true, lastSeq: 8 });
    expect(t.store.getState().players.map((p) => p.nickname)).toEqual(['Ana', 'Bo', 'Z', 'Y']);
  });

  it('every resubscription refetches the snapshot', async () => {
    const t = setup(async () => snapshot());
    await t.controller.create('Ana');
    await tick();
    const n = vi.mocked(t.api.getSnapshot).mock.calls.length;
    t.h().onSubscribed();
    await tick();
    expect(t.api.getSnapshot).toHaveBeenCalledTimes(n + 1);
  });

  it('only the newest snapshot response is applied', async () => {
    const resolvers: Array<(s: GameSnapshot) => void> = [];
    const t = setup(() => new Promise((r) => resolvers.push(r)));
    await t.controller.create('Ana'); // fetch #1
    t.h().onSubscribed(); // fetch #2
    resolvers[1]!(snapshot({ status: 'running' }));
    await tick();
    resolvers[0]!(snapshot({ status: 'lobby' }));
    await tick();
    expect(t.store.getState().status).toBe('running');
  });

  it('resume: rejoins from storage; a 404 clears the session', async () => {
    const t = setup(async () => {
      throw new ApiRequestError(404, 'no game');
    });
    t.sessions.save({ code: 'ABCDE', playerId: 'p1', playerToken: 't', nickname: 'Ana' });
    expect(t.controller.resume()).toBe(true);
    await tick();
    expect(t.sessions.load()).toBeNull();
    expect(t.store.getState().code).toBeNull();
    expect(t.closed).toHaveBeenCalled();
  });

  it('resume with no session does nothing', () => {
    expect(setup(async () => snapshot()).controller.resume()).toBe(false);
  });

  it('reload mid-order re-takes to recover the statement', async () => {
    const t = setup(async () =>
      snapshot({ me: { playerId: 'p1', nickname: 'Ana', score: 0, currentOrderId: 'o1', condiments: 0, sabotage: null } }),
    );
    vi.mocked(t.api.takeOrder).mockResolvedValue({ ...snapshot().orders[0]!, statement: 'S', signature: 'function solve()', publicCases: [] });
    await t.controller.create('Ana');
    await tick();
    expect(t.api.takeOrder).toHaveBeenCalledWith('ABCDE', 'o1', 'tok');
    expect(t.store.getState().taken?.statement).toBe('S');
  });

  it('submit stores the result; action errors land in the store', async () => {
    const t = setup(async () => snapshot());
    await t.controller.create('Ana');
    await tick();
    const taken = { ...snapshot().orders[0]!, statement: 'S', signature: 'f', publicCases: [] };
    vi.mocked(t.api.takeOrder).mockResolvedValue(taken);
    await t.controller.takeOrder('o1');
    vi.mocked(t.api.submit).mockResolvedValue({ passed: true, rank: 1, points: 100, scores: {} });
    await t.controller.submit('return 1');
    expect(t.store.getState()).toMatchObject({ submitting: false, lastSubmit: { orderId: 'o1', result: { passed: true } } });
    vi.mocked(t.api.submit).mockRejectedValue(new ApiRequestError(409, 'Order is closed'));
    await t.controller.submit('x');
    expect(t.store.getState().actionError).toBe('Order is closed');
  });

  it('leave closes the channel and resets state', async () => {
    const t = setup(async () => snapshot());
    await t.controller.create('Ana');
    t.controller.leave();
    expect(t.closed).toHaveBeenCalled();
    expect(t.store.getState().code).toBeNull();
    expect(t.sessions.load()).toBeNull();
  });
});

export type { GameEvent };
