import { describe, expect, it } from 'vitest';
import { applySnapshot, beginSync, hasOpenGap, markStale, MAX_TOASTS, receiveEvent, reduceEvent } from './reducer.ts';
import { initialState, type GameState } from './state.ts';
import { ev, snapshot } from './testing.ts';

const synced = (over: Partial<GameState> = {}): GameState => ({
  ...applySnapshot({ ...initialState(), playerId: 'p1' }, snapshot(), 0),
  ...over,
});

describe('reduceEvent', () => {
  it('player.joined adds once', () => {
    let s = synced();
    s = reduceEvent(s, ev('player.joined', 1, { playerId: 'p3', nickname: 'Cy' }));
    s = reduceEvent(s, ev('player.joined', 2, { playerId: 'p3', nickname: 'Cy' }));
    expect(s.players.map((p) => p.nickname)).toEqual(['Ana', 'Bo', 'Cy']);
  });

  it('player.joined starts idle and uncursed', () => {
    const s = reduceEvent(synced(), ev('player.joined', 1, { playerId: 'p3', nickname: 'Cy' }));
    expect(s.players[2]).toEqual({ playerId: 'p3', nickname: 'Cy', score: 0, currentOrderId: null, sabotage: null });
  });

  it('game.started sets status and timings', () => {
    const s = reduceEvent(synced({ status: 'lobby' }), ev('game.started', 1, { startedAt: 1, rushAt: 2, endsAt: 3 }));
    expect(s).toMatchObject({ status: 'running', startedAt: 1, rushAt: 2, endsAt: 3, rush: false });
  });

  it('order.opened starts with nobody delivered', () => {
    const s = reduceEvent(synced(), ev('order.opened', 1, { orderId: 'o2', title: 'T', difficulty: 'easy', basePoints: 100, expiresAt: 9 }));
    expect(s.orders[1]).toMatchObject({ orderId: 'o2', deliveries: 0, deliveredBy: [] });
  });

  it('order.opened adds (idempotent), expired removes', () => {
    const data = { orderId: 'o2', title: 'T', difficulty: 'hard', basePoints: 300, expiresAt: 9 };
    let s = reduceEvent(synced(), ev('order.opened', 1, data));
    s = reduceEvent(s, ev('order.opened', 2, data));
    expect(s.orders.map((o) => o.orderId)).toEqual(['o1', 'o2']);
    s = reduceEvent(s, ev('order.expired', 3, { orderId: 'o1' }));
    expect(s.orders.map((o) => o.orderId)).toEqual(['o2']);
  });

  it('order.taken by me sets currentOrderId; by others only toasts', () => {
    let s = reduceEvent(synced(), ev('order.taken', 1, { orderId: 'o1', playerId: 'p2' }));
    expect(s.me?.currentOrderId).toBeNull();
    expect(s.toasts.at(-1)?.text).toContain('Bo');
    s = reduceEvent(s, ev('order.taken', 2, { orderId: 'o1', playerId: 'p1' }));
    expect(s.me?.currentOrderId).toBe('o1');
  });

  it('order.taken sets that player\'s currentOrderId in the public list (me and others)', () => {
    let s = reduceEvent(synced(), ev('order.taken', 1, { orderId: 'o1', playerId: 'p2' }));
    expect(s.players.map((p) => p.currentOrderId)).toEqual([null, 'o1']);
    s = reduceEvent(s, ev('order.taken', 2, { orderId: 'o1', playerId: 'p1' }));
    expect(s.players.map((p) => p.currentOrderId)).toEqual(['o1', 'o1']);
    expect(s.me?.currentOrderId).toBe('o1');
  });

  it('order.delivered puts the player at deliveredBy[rank - 1], idempotently, and frees their cook slot', () => {
    let s = synced();
    s = reduceEvent(s, ev('order.taken', 1, { orderId: 'o1', playerId: 'p2' }));
    const d1 = ev('order.delivered', 2, { orderId: 'o1', playerId: 'p2', rank: 1, points: 100, scores: { p1: 0, p2: 100 } });
    s = reduceEvent(s, d1);
    s = reduceEvent(s, d1); // replay
    expect(s.orders[0]).toMatchObject({ deliveredBy: ['p2'], deliveries: 1 });
    expect(s.players[1]?.currentOrderId).toBeNull();
    s = reduceEvent(s, ev('order.delivered', 3, { orderId: 'o1', playerId: 'p1', rank: 2, points: 60, scores: { p1: 60, p2: 100 } }));
    expect(s.orders[0]).toMatchObject({ deliveredBy: ['p2', 'p1'], deliveries: 2 });
  });

  it('order.delivered never leaves holes when a rank arrives out of step', () => {
    const s = reduceEvent(synced(), ev('order.delivered', 1, { orderId: 'o1', playerId: 'p2', rank: 3, points: 30, scores: { p1: 0, p2: 30 } }));
    expect(s.orders[0]?.deliveredBy).toEqual(['p2']);
  });

  it('order.expired frees every player who was cooking it', () => {
    let s = reduceEvent(synced(), ev('order.taken', 1, { orderId: 'o1', playerId: 'p2' }));
    s = reduceEvent(s, ev('order.expired', 2, { orderId: 'o1' }));
    expect(s.players.map((p) => p.currentOrderId)).toEqual([null, null]);
  });

  it('order.delivered replaces scores, bumps deliveries, clears my current order', () => {
    const base = synced();
    const s0: GameState = { ...base, me: { ...base.me!, currentOrderId: 'o1', score: 5 }, players: base.players.map((p) => ({ ...p, score: 5 })) };
    const s = reduceEvent(s0, ev('order.delivered', 1, { orderId: 'o1', playerId: 'p1', rank: 1, points: 100, scores: { p1: 105, p2: 5 } }));
    expect(s.players.map((p) => p.score)).toEqual([105, 5]);
    expect(s.me).toMatchObject({ score: 105, currentOrderId: null });
    expect(s.orders[0]?.deliveries).toBe(1);
    // replaying with a different table replaces, doesn't add
    const again = reduceEvent(s, ev('order.delivered', 2, { orderId: 'o1', playerId: 'p2', rank: 2, points: 60, scores: { p1: 105, p2: 65 } }));
    expect(again.players.map((p) => p.score)).toEqual([105, 65]);
    expect(again.me?.currentOrderId).toBeNull();
  });

  it("someone else's delivery keeps my current order", () => {
    const base = synced();
    const s = reduceEvent(
      { ...base, me: { ...base.me!, currentOrderId: 'o1' } },
      ev('order.delivered', 1, { orderId: 'o1', playerId: 'p2', rank: 1, points: 100, scores: { p1: 0, p2: 100 } }),
    );
    expect(s.me?.currentOrderId).toBe('o1');
  });

  it('dish.burned updates scores', () => {
    const s = reduceEvent(synced(), ev('dish.burned', 1, { playerId: 'p2', orderId: 'o1', penalty: 10, scores: { p1: 0, p2: -10 } }));
    expect(s.players[1]?.score).toBe(-10);
    expect(s.toasts.at(-1)?.kind).toBe('bad');
  });

  it('order.expired clears my current order if it was that one', () => {
    const base = synced();
    const s = reduceEvent({ ...base, me: { ...base.me!, currentOrderId: 'o1' } }, ev('order.expired', 1, { orderId: 'o1' }));
    expect(s.me?.currentOrderId).toBeNull();
  });

  it('condiment.earned increments mine, capped at 2', () => {
    let s = synced();
    for (let i = 1; i <= 3; i++) s = reduceEvent(s, ev('condiment.earned', i, { playerId: 'p1' }));
    expect(s.me?.condiments).toBe(2);
    expect(reduceEvent(s, ev('condiment.earned', 9, { playerId: 'p2' })).me?.condiments).toBe(2);
  });

  it('sabotage applied/cleared', () => {
    const base = synced();
    let s = reduceEvent(
      { ...base, me: { ...base.me!, condiments: 1 } },
      ev('sabotage.applied', 1, { fromPlayerId: 'p1', toPlayerId: 'p2', rule: 'no-loops' }),
    );
    expect(s.me).toMatchObject({ condiments: 0, solved: 0, sabotage: null });
    s = reduceEvent(s, ev('sabotage.applied', 2, { fromPlayerId: 'p2', toPlayerId: 'p1', rule: 'max-lines-3' }));
    expect(s.me?.sabotage).toBe('max-lines-3');
    s = reduceEvent(s, ev('sabotage.cleared', 3, { playerId: 'p1' }));
    expect(s.me?.sabotage).toBeNull();
  });

  it('sabotage events keep players[].sabotage in sync for everyone', () => {
    let s = reduceEvent(synced(), ev('sabotage.applied', 1, { fromPlayerId: 'p1', toPlayerId: 'p2', rule: 'no-loops' }));
    expect(s.players.map((p) => p.sabotage)).toEqual([null, 'no-loops']);
    s = reduceEvent(s, ev('sabotage.applied', 2, { fromPlayerId: 'p2', toPlayerId: 'p1', rule: 'max-lines-3' }));
    expect(s.players.map((p) => p.sabotage)).toEqual(['max-lines-3', 'no-loops']);
    s = reduceEvent(s, ev('sabotage.cleared', 3, { playerId: 'p2' }));
    expect(s.players.map((p) => p.sabotage)).toEqual(['max-lines-3', null]);
    expect(s.me?.sabotage).toBe('max-lines-3');
  });

  it('rush.started and game.finished', () => {
    let s = reduceEvent(synced(), ev('rush.started', 1, {}));
    expect(s.rush).toBe(true);
    s = reduceEvent(s, ev('game.finished', 2, { podium: ['p2', 'p1'], awards: { x: 'p2' }, scores: { p1: 1, p2: 9 } }));
    expect(s).toMatchObject({ status: 'finished', podium: ['p2', 'p1'], awards: { x: 'p2' } });
    expect(s.players.map((p) => p.score)).toEqual([1, 9]);
  });

  it('ignores unknown event types', () => {
    const s = synced();
    expect(reduceEvent(s, { type: 'future.thing', seq: 1, at: 1, data: {} } as never)).toBe(s);
  });

  it('caps the toast queue', () => {
    let s = synced();
    for (let i = 1; i <= 9; i++) s = reduceEvent(s, ev('player.joined', i, { playerId: `x${i}`, nickname: `N${i}` }));
    expect(s.toasts).toHaveLength(MAX_TOASTS);
  });
});

describe('receiveEvent sequencing', () => {
  const joined = (seq: number) => ev('player.joined', seq, { playerId: `x${seq}`, nickname: `N${seq}` });

  it('applies contiguous events and tracks lastSeq', () => {
    let s = synced();
    s = receiveEvent(s, joined(1));
    s = receiveEvent(s, joined(2));
    expect(s.lastSeq).toBe(2);
    expect(s.players).toHaveLength(4);
  });

  it('ignores duplicate and old seq', () => {
    let s = receiveEvent(synced(), joined(1));
    const before = s;
    s = receiveEvent(s, joined(1));
    s = receiveEvent(s, joined(0));
    expect(s).toBe(before);
  });

  it('a gap keeps the event buffered, still synced (reorder window)', () => {
    let s = receiveEvent(synced(), joined(1));
    s = receiveEvent(s, joined(4));
    expect(s.synced).toBe(true);
    expect(hasOpenGap(s)).toBe(true);
    expect(s.buffer.map((e) => e.seq)).toEqual([4]);
    expect(s.players).toHaveLength(3); // 4 not applied yet
  });

  it('an out-of-order batch fills without a resync and applies in order', () => {
    let s = synced(); // lastSeq 0
    for (const seq of [2, 5, 3, 7, 6, 4, 1, 8]) s = receiveEvent(s, joined(seq));
    expect(hasOpenGap(s)).toBe(false);
    expect(s).toMatchObject({ synced: true, lastSeq: 8, buffer: [] });
    expect(s.players.map((p) => p.playerId).slice(2)).toEqual(['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8']);
  });

  it('duplicates are ignored, in the buffer and after applying', () => {
    let s = synced();
    s = receiveEvent(s, joined(2));
    s = receiveEvent(s, joined(2));
    expect(s.buffer).toHaveLength(1);
    s = receiveEvent(s, joined(1));
    s = receiveEvent(s, joined(2));
    s = receiveEvent(s, joined(1));
    expect(s.players).toHaveLength(4);
    expect(s.lastSeq).toBe(2);
  });

  it('markStale un-syncs but keeps the buffer for the snapshot replay', () => {
    const s = markStale(receiveEvent(synced(), joined(3)));
    expect(s).toMatchObject({ synced: false });
    expect(s.buffer.map((e) => e.seq)).toEqual([3]);
  });

  it('buffers while not synced, deduping', () => {
    let s = beginSync(synced());
    s = receiveEvent(s, joined(2));
    s = receiveEvent(s, joined(2));
    s = receiveEvent(s, joined(1));
    expect(s.buffer.map((e) => e.seq)).toEqual([2, 1]);
    expect(s.players).toHaveLength(2);
  });
});

describe('applySnapshot + buffered events', () => {
  it('replays buffered events with seq > snapshot.seq, in seq order', () => {
    let s = initialState();
    s = receiveEvent(s, ev('player.joined', 11, { playerId: 'p4', nickname: 'Di' }));
    s = receiveEvent(s, ev('player.joined', 10, { playerId: 'p3', nickname: 'Cy' }));
    s = applySnapshot(s, snapshot({ seq: 9 }), 0);
    expect(s.players.map((p) => p.nickname)).toEqual(['Ana', 'Bo', 'Cy', 'Di']);
    expect(s).toMatchObject({ synced: true, lastSeq: 11, buffer: [] });
  });

  it('drops buffered events already reflected in the snapshot (seq <= snapshot.seq)', () => {
    let s = receiveEvent(initialState(), ev('condiment.earned', 4, { playerId: 'p1' }));
    s = applySnapshot(s, snapshot({ seq: 4, me: { playerId: 'p1', nickname: 'Ana', score: 0, currentOrderId: null, condiments: 1, solved: 0, sabotage: null } }), 0);
    expect(s.me?.condiments).toBe(1); // not double-counted
    expect(s.lastSeq).toBe(4);
    expect(receiveEvent(s, ev('condiment.earned', 5, { playerId: 'p1' })).me?.condiments).toBe(2);
  });

  it('baseline is exact: a live event after snapshot.seq + 1 is a gap', () => {
    const s = applySnapshot(initialState(), snapshot({ seq: 4 }), 0);
    expect(s.lastSeq).toBe(4);
    const gap = receiveEvent(s, ev('rush.started', 6, {}));
    expect(hasOpenGap(gap)).toBe(true);
    expect(gap.rush).toBe(false);
    expect(gap.buffer.map((e) => e.seq)).toEqual([6]);
  });

  it('a gap between snapshot.seq and the buffer un-syncs, keeping the tail', () => {
    let s = receiveEvent(initialState(), ev('rush.started', 6, {}));
    s = applySnapshot(s, snapshot({ seq: 4 }), 0);
    expect(s.synced).toBe(false);
    expect(s.rush).toBe(false);
    expect(s.buffer.map((e) => e.seq)).toEqual([6]);
  });

  it('a gap inside the buffer un-syncs again keeping the tail', () => {
    let s = receiveEvent(initialState(), ev('rush.started', 5, {}));
    s = receiveEvent(s, ev('player.joined', 8, { playerId: 'p9', nickname: 'Z' }));
    s = applySnapshot(s, snapshot({ seq: 4 }), 0);
    expect(s.synced).toBe(false);
    expect(s.rush).toBe(true);
    expect(s.lastSeq).toBe(5);
    expect(s.buffer.map((e) => e.seq)).toEqual([8]);
  });

  it('replaces server-owned state and keeps live-only state', () => {
    const base = synced();
    const taken = { ...snapshot().orders[0]!, statement: 's', signature: 'function solve()', publicCases: [] };
    const s0: GameState = { ...base, taken, me: { ...base.me!, currentOrderId: 'o1' }, toasts: [{ id: '1', kind: 'info', text: 't', at: 1 }] };
    const s = applySnapshot(
      s0,
      snapshot({ orders: [], me: { playerId: 'p1', nickname: 'Ana', score: 50, currentOrderId: 'o1', condiments: 1, solved: 0, sabotage: 'no-loops' } }),
      42,
    );
    expect(s.orders).toEqual([]);
    expect(s.me).toMatchObject({ score: 50, sabotage: 'no-loops' });
    expect(s.taken).toBe(taken);
    expect(s.toasts).toHaveLength(1);
    expect(s.clockOffset).toBe(42);
  });

  it('drops taken details if the server says I am not on that order', () => {
    const base = synced();
    const taken = { ...snapshot().orders[0]!, statement: 's', signature: 'x', publicCases: [] };
    expect(applySnapshot({ ...base, taken }, snapshot(), 0).taken).toBeNull();
  });

  it('derives rush from snapshot time', () => {
    expect(applySnapshot(initialState(), snapshot({ rushAt: 500, now: 1000 }), 0).rush).toBe(true);
    expect(applySnapshot(initialState(), snapshot({ rushAt: 5000, now: 1000 }), 0).rush).toBe(false);
  });
});
