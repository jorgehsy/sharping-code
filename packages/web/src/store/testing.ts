import type { EventPayloads, EventType, GameEvent, GameSnapshot } from '@sharping/shared';

export const ev = <T extends EventType>(type: T, seq: number, data: EventPayloads[T], at = 1000 + seq): GameEvent<T> => ({
  type,
  seq,
  at,
  data,
});

export const snapshot = (over: Partial<GameSnapshot> = {}): GameSnapshot => ({
  code: 'ABCDE',
  status: 'running',
  hostPlayerId: 'p1',
  createdAt: 0,
  startedAt: 100,
  rushAt: 900_000,
  endsAt: 1_000_000,
  now: 1000,
  seq: 0,
  players: [
    { playerId: 'p1', nickname: 'Ana', score: 0 },
    { playerId: 'p2', nickname: 'Bo', score: 0 },
  ],
  orders: [{ orderId: 'o1', title: 'Pair sum', difficulty: 'easy', basePoints: 100, openedAt: 100, expiresAt: 500_000, deliveries: 0 }],
  me: { playerId: 'p1', nickname: 'Ana', score: 0, currentOrderId: null, condiments: 0, sabotage: null },
  ...over,
});
