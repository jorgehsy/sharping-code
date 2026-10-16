import { describe, expect, it } from 'vitest';
import { applySnapshot, reduceEvent } from '../store/reducer.ts';
import { initialState, type GameState } from '../store/state.ts';
import { ev, snapshot } from '../store/testing.ts';
import { cuesFor, HURRY_MS, hurryOrder, wantsMusic } from './cues.ts';

const synced = (over: Partial<GameState> = {}): GameState => ({
  ...applySnapshot({ ...initialState(), playerId: 'p1' }, snapshot(), 0),
  ...over,
});
const taking = (s: GameState, orderId = 'o1') => reduceEvent(s, ev('order.taken', 1, { orderId, playerId: 'p1' }));

describe('cuesFor', () => {
  it('first snapshot is silent', () => {
    const prev = { ...initialState(), code: 'ABCDE', playerId: 'p1' };
    expect(cuesFor(prev, synced())).toEqual([]);
  });

  it('player joins the lobby', () => {
    const s = synced({ status: 'lobby' });
    expect(cuesFor(s, reduceEvent(s, ev('player.joined', 1, { playerId: 'p3', nickname: 'Cy' })))).toEqual(['playerJoined']);
  });

  it('game starts and finishes', () => {
    const lobby = synced({ status: 'lobby' });
    const running = reduceEvent(lobby, ev('game.started', 1, { startedAt: 1, rushAt: 2, endsAt: 3 }));
    expect(cuesFor(lobby, running)).toEqual(['gameStarted']);
    const done = reduceEvent(running, ev('game.finished', 2, { podium: [], awards: {}, scores: {} }));
    expect(cuesFor(running, done)).toEqual(['gameFinished']);
  });

  it('new order opens', () => {
    const s = synced();
    const n = reduceEvent(s, ev('order.opened', 1, { orderId: 'o2', title: 'T', difficulty: 'easy', basePoints: 100, expiresAt: 9 }));
    expect(cuesFor(s, n)).toEqual(['orderOpened']);
  });

  it('my delivery chimes, somebody else delivering is silent', () => {
    const s = taking(synced());
    const mine = reduceEvent(s, ev('order.delivered', 2, { orderId: 'o1', playerId: 'p1', rank: 1, points: 100, scores: { p1: 100 } }));
    expect(cuesFor(s, mine)).toEqual(['myDelivery']);
    const theirs = reduceEvent(s, ev('order.delivered', 2, { orderId: 'o1', playerId: 'p2', rank: 1, points: 100, scores: { p2: 100 } }));
    expect(cuesFor(s, theirs)).toEqual([]);
  });

  it('my burned dish is a penalty, somebody else burning is silent', () => {
    const s = synced();
    const mine = reduceEvent(s, ev('dish.burned', 1, { playerId: 'p1', orderId: 'o1', penalty: 10, scores: { p1: -10 } }));
    expect(cuesFor(s, mine)).toEqual(['penalty']);
    const theirs = reduceEvent(s, ev('dish.burned', 1, { playerId: 'p2', orderId: 'o1', penalty: 10, scores: { p2: -10 } }));
    expect(cuesFor(s, theirs)).toEqual([]);
  });

  it('my order expiring is a penalty', () => {
    const s = taking(synced());
    expect(cuesFor(s, reduceEvent(s, ev('order.expired', 2, { orderId: 'o1' })))).toEqual(['penalty']);
  });

  it('sabotage against me, not by me', () => {
    const s = synced();
    const hit = reduceEvent(s, ev('sabotage.applied', 1, { fromPlayerId: 'p2', toPlayerId: 'p1', rule: 'no-loops' }));
    expect(cuesFor(s, hit)).toEqual(['sabotaged']);
    const sent = reduceEvent(synced({ me: { ...s.me!, condiments: 1 } }), ev('sabotage.applied', 1, { fromPlayerId: 'p1', toPlayerId: 'p2', rule: 'no-loops' }));
    expect(cuesFor(s, sent)).toEqual([]);
  });

  it('I earn a condiment', () => {
    const s = synced();
    expect(cuesFor(s, reduceEvent(s, ev('condiment.earned', 1, { playerId: 'p1' })))).toEqual(['condiment']);
  });
});

describe('hurryOrder', () => {
  const s = taking(synced()); // o1 expires at 500_000
  const at = (left: number) => 500_000 - left;

  it('fires once my order is inside the window', () => {
    expect(hurryOrder(s, at(HURRY_MS + 1), new Set())).toBeNull();
    expect(hurryOrder(s, at(HURRY_MS), new Set())).toBe('o1');
  });

  it('only once per order, and never after expiry', () => {
    expect(hurryOrder(s, at(1000), new Set(['o1']))).toBeNull();
    expect(hurryOrder(s, at(0), new Set())).toBeNull();
  });

  it('ignores orders I am not cooking', () => {
    expect(hurryOrder(synced(), at(1000), new Set())).toBeNull();
  });
});

describe('wantsMusic', () => {
  it('plays in the lobby and in game, not on home or the final screen', () => {
    expect(wantsMusic(initialState())).toBe(false);
    expect(wantsMusic(synced({ status: 'lobby' }))).toBe(true);
    expect(wantsMusic(synced())).toBe(true);
    expect(wantsMusic(synced({ status: 'finished' }))).toBe(false);
  });
});
