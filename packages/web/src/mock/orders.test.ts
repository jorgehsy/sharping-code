import { describe, expect, it } from 'vitest';
import { applySnapshot, receiveEvent } from '../store/reducer.ts';
import { initialState } from '../store/state.ts';
import { snapshot } from '../store/testing.ts';
import { withMockOrders } from './index.ts';
import { MockOrders, type DraftEvent } from './orders.ts';
import type { GameApi } from '../api/client.ts';

const T0 = 1_000_000;
const timing = { startedAt: T0, rushAt: T0 + 12 * 60_000, endsAt: T0 + 15 * 60_000 };

function setup() {
  let now = T0;
  const mock = new MockOrders({ now: () => now, defer: (f) => f(), openTarget: 3 });
  const events: DraftEvent[] = [];
  mock.onEvent((e) => events.push(e));
  mock.observe({ players: [{ playerId: 'p1', nickname: 'Ana', score: 0 }], me: { playerId: 'p1', nickname: 'Ana', score: 0, currentOrderId: null, condiments: 0, sabotage: null } });
  return { mock, events, setNow: (n: number) => (now = n) };
}

describe('MockOrders', () => {
  it('seeds orders on start (idempotent) and emits order.opened', () => {
    const { mock, events } = setup();
    mock.ensureRunning(timing);
    mock.ensureRunning(timing);
    expect(mock.orders()).toHaveLength(3);
    expect(events.map((e) => e.type)).toEqual(['order.opened', 'order.opened', 'order.opened']);
  });

  it('rotates: expired orders emit order.expired and are replaced', () => {
    const { mock, events, setNow } = setup();
    mock.ensureRunning(timing);
    events.length = 0;
    setNow(T0 + 4 * 60_000); // easy orders (3 min) are gone
    mock.advance();
    const types = events.map((e) => e.type);
    expect(types).toContain('order.expired');
    expect(types).toContain('order.opened');
    expect(mock.orders()).toHaveLength(3);
  });

  it('take returns the full order and emits order.taken', () => {
    const { mock, events } = setup();
    mock.ensureRunning(timing);
    const id = mock.orders()[0]!.orderId;
    const t = mock.take(id);
    expect(t.statement).toBeTruthy();
    expect(t.signature).toMatch(/^function solve/);
    expect(t.publicCases.length).toBeGreaterThan(0);
    expect(events.at(-1)).toMatchObject({ type: 'order.taken', data: { orderId: id, playerId: 'p1' } });
  });

  it('submit without "return" fails a public case and burns the dish', () => {
    const { mock, events } = setup();
    mock.ensureRunning(timing);
    const r = mock.submit(mock.orders()[0]!.orderId, 'function solve() {}');
    expect(r).toMatchObject({ passed: false, penalty: 10, scores: { p1: -10 } });
    if (!r.passed) expect(r.case).toBeDefined();
    expect(events.at(-1)?.type).toBe('dish.burned');
  });

  it('submit with "return" delivers with degrading shares', () => {
    const { mock, events } = setup();
    mock.ensureRunning(timing);
    const o = mock.orders()[0]!;
    const a = mock.submit(o.orderId, 'return 1');
    const b = mock.submit(o.orderId, 'return 1');
    expect(a).toMatchObject({ passed: true, rank: 1, points: o.basePoints });
    expect(b).toMatchObject({ passed: true, rank: 2, points: Math.round(o.basePoints * 0.6) });
    expect(events.filter((e) => e.type === 'order.delivered')).toHaveLength(2);
  });

  it('closed order → error with status 409', () => {
    const { mock } = setup();
    mock.ensureRunning(timing);
    expect(() => mock.take('nope')).toThrow('closed');
  });

  it('emits rush.started and game.finished on time', () => {
    const { mock, events, setNow } = setup();
    mock.ensureRunning(timing);
    setNow(timing.rushAt);
    mock.advance();
    expect(events.some((e) => e.type === 'rush.started')).toBe(true);
    setNow(timing.endsAt);
    mock.advance();
    expect(events.at(-1)?.type).toBe('game.finished');
  });

  it('events feed the real reducer path and match the snapshot view', () => {
    const { mock, events } = setup();
    mock.ensureRunning(timing);
    const id = mock.orders()[0]!.orderId;
    mock.submit(id, 'return 1');
    let s = applySnapshot(initialState(), snapshot({ orders: [], players: [{ playerId: 'p1', nickname: 'Ana', score: 0 }], now: 0 }), 0);
    events.forEach((e, i) => (s = receiveEvent(s, { ...e, seq: i + 1 } as never)));
    expect(s.orders.find((o) => o.orderId === id)?.deliveries).toBe(1);
    expect(s.players[0]?.score).toBeGreaterThan(0);
  });
});

describe('withMockOrders', () => {
  it('overrides only orders routes and injects mock orders into running snapshots', async () => {
    const real = {
      getSnapshot: async () => snapshot({ startedAt: timing.startedAt, rushAt: timing.rushAt, endsAt: timing.endsAt, orders: [] }),
      startGame: async () => {},
    } as unknown as GameApi;
    const { api } = withMockOrders(real, { subscribe: () => ({ close() {} }) }, new MockOrders({ now: () => T0, defer: (f) => f() }));
    const snap = await api.getSnapshot('ABCDE', 't');
    expect(snap.orders.length).toBeGreaterThan(0);
    expect(snap.seq).toBe(0); // mock-owned counter, nothing stamped yet
    expect(api.startGame).toBe(real.startGame);
    const t = await api.takeOrder('ABCDE', snap.orders[0]!.orderId, 't');
    expect(t.statement).toBeTruthy();
  });
});
