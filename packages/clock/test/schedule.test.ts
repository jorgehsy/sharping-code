import { describe, it, expect } from 'vitest';
import { ORDER_CLOCK_MS } from '../src/game.ts';
import {
  buildSchedule,
  computeResults,
  ORDER_SLOTS,
  planOrders,
  planWaitSeconds,
  seededRng,
  type ClockAction,
  type PlannedOrder,
} from '../src/schedule.ts';

const PUZZLES = [
  { id: 'e1', title: 'E1', difficulty: 'easy' as const },
  { id: 'e2', title: 'E2', difficulty: 'easy' as const },
  { id: 'm1', title: 'M1', difficulty: 'medium' as const },
  { id: 'h1', title: 'H1', difficulty: 'hard' as const },
  { id: 'h2', title: 'H2', difficulty: 'hard' as const },
];
const input = { gameCode: 'ABCDE', startedAt: 1_000_000, rushAt: 1_000_000 + 720_000, endsAt: 1_000_000 + 900_000 };
const opens = (s: ReturnType<typeof buildSchedule>): PlannedOrder[] =>
  s.flatMap((t) => t.actions).flatMap((a) => (a.kind === 'open' ? [a.order] : []));

describe('seededRng', () => {
  it('is deterministic per seed and in [0,1)', () => {
    const a = seededRng('X'), b = seededRng('X'), c = seededRng('Y');
    const xs = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(xs);
    expect(Array.from({ length: 5 }, c)).not.toEqual(xs);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
  });
});

describe('buildSchedule', () => {
  it('is deterministic for the same input', () => {
    expect(buildSchedule(input, PUZZLES)).toEqual(buildSchedule(input, PUZZLES));
  });

  it('differs between game codes', () => {
    expect(buildSchedule({ ...input, gameCode: 'ZZZZZ' }, PUZZLES)).not.toEqual(buildSchedule(input, PUZZLES));
  });

  it('is sorted, opens ORDER_SLOTS orders in the first tick, ends with rush then finish', () => {
    const s = buildSchedule(input, PUZZLES);
    expect(s.map((t) => t.plannedAt)).toEqual([...s.map((t) => t.plannedAt)].sort((a, b) => a - b));
    expect(s[0]!.plannedAt).toBe(input.startedAt);
    expect(s[0]!.actions.filter((a) => a.kind === 'open')).toHaveLength(ORDER_SLOTS);
    const kinds = s.flatMap((t) => t.actions.map((a) => a.kind));
    expect(kinds.at(-1)).toBe('finish');
    expect(kinds.filter((k) => k === 'rush')).toHaveLength(1);
    expect(s.find((t) => t.actions.some((a) => a.kind === 'rush'))!.plannedAt).toBe(input.rushAt);
    expect(s.at(-1)!.plannedAt).toBe(input.endsAt);
  });

  it('keeps ~ORDER_SLOTS orders open at any time and never past endsAt', () => {
    const orders = opens(buildSchedule(input, PUZZLES));
    for (const o of orders) {
      expect(o.expiresAt).toBeLessThanOrEqual(input.endsAt);
      expect(o.expiresAt).toBeGreaterThan(o.openedAt);
    }
    for (let t = input.startedAt; t < input.endsAt - 90_000; t += 10_000) {
      const n = orders.filter((o) => o.openedAt <= t && t < o.expiresAt).length;
      expect(n).toBeLessThanOrEqual(ORDER_SLOTS);
      expect(n).toBeGreaterThanOrEqual(ORDER_SLOTS - 2); // late slots may stay empty when nothing fits
    }
  });

  it('expire + open of a slot share a tick, expire first', () => {
    const s = buildSchedule(input, PUZZLES);
    const t = s.find((t) => t.actions.some((a) => a.kind === 'expire'))!;
    const kinds = t.actions.map((a) => a.kind);
    expect(kinds.indexOf('expire')).toBeLessThan(kinds.indexOf('open'));
  });

  it('every non-capped order is expired exactly once, at its expiresAt; capped ones are not', () => {
    const s = buildSchedule(input, PUZZLES);
    const orders = opens(s);
    const expired = s.flatMap((t) => t.actions.map((a: ClockAction) => ({ a, at: t.plannedAt }))).filter((x) => x.a.kind === 'expire');
    for (const o of orders) {
      const e = expired.filter((x) => x.a.kind === 'expire' && x.a.orderId === o.orderId);
      expect(e).toHaveLength(o.expiresAt < input.endsAt ? 1 : 0);
      if (e[0]) expect(e[0].at).toBe(o.expiresAt);
    }
  });

  it('uses the order clock of its difficulty unless capped, with unique ids', () => {
    const orders = opens(buildSchedule(input, PUZZLES));
    expect(new Set(orders.map((o) => o.orderId)).size).toBe(orders.length);
    for (const o of orders) {
      expect(o.expiresAt).toBe(Math.min(o.openedAt + ORDER_CLOCK_MS[o.difficulty], input.endsAt));
    }
  });

  it('does not open orders that cannot be meaningfully finished', () => {
    const orders = opens(buildSchedule(input, PUZZLES));
    for (const o of orders) {
      expect(input.endsAt - o.openedAt).toBeGreaterThanOrEqual(ORDER_CLOCK_MS[o.difficulty] * 0.5);
    }
  });

  it('mixes difficulties at the start', () => {
    const first = opens(buildSchedule(input, PUZZLES)).slice(0, ORDER_SLOTS);
    expect(new Set(first.map((o) => o.difficulty))).toEqual(new Set(['easy', 'medium', 'hard']));
  });

  it('avoids repeating a puzzle among open orders while the catalog allows it', () => {
    // 2 easy + 1 medium + 2 hard puzzles for a mix of easy,easy,medium,medium,hard: only the 2nd medium must repeat.
    const first = opens(buildSchedule(input, PUZZLES)).slice(0, ORDER_SLOTS);
    expect(new Set(first.map((o) => o.puzzleId)).size).toBe(4);
  });

  it('falls back to available difficulties and tolerates a tiny catalog', () => {
    const small = [{ id: 'e1', title: 'E1', difficulty: 'easy' as const }];
    const orders = opens(buildSchedule(input, small));
    expect(orders.length).toBeGreaterThan(ORDER_SLOTS);
    expect(orders.every((o) => o.puzzleId === 'e1' && o.difficulty === 'easy')).toBe(true);
  });

  it('with an empty catalog only rush and finish remain', () => {
    const s = buildSchedule(input, []);
    expect(s.map((t) => t.actions.map((a) => a.kind))).toEqual([['rush'], ['finish']]);
  });

  it('keeps the number of ticks (durable waits + steps) bounded', () => {
    expect(buildSchedule(input, PUZZLES).length).toBeLessThanOrEqual(30);
  });

  it('uses the bundled catalog by default', () => {
    expect(opens(buildSchedule(input)).length).toBeGreaterThan(0);
  });

  it('merges rush into the same tick as an expiry when they coincide', () => {
    const s = buildSchedule({ ...input, rushAt: input.startedAt + ORDER_CLOCK_MS.easy }, [PUZZLES[0]!]);
    const t = s.find((t) => t.plannedAt === input.startedAt + ORDER_CLOCK_MS.easy)!;
    expect(t.actions.some((a) => a.kind === 'rush')).toBe(true);
    expect(t.actions.at(-1)!.kind).toBe('rush');
  });
});

describe('planOrders', () => {
  it('first tick opens at startedAt', () => {
    expect(planOrders(input, PUZZLES)[0]!.plannedAt).toBe(input.startedAt);
  });
});

describe('planWaitSeconds', () => {
  it('0 when late or within margin', () => {
    expect(planWaitSeconds(-500, 1000)).toBe(0);
    expect(planWaitSeconds(1900, 1000)).toBe(0);
  });
  it('floors to wake early', () => {
    expect(planWaitSeconds(10_500, 1000)).toBe(9);
  });
});

describe('computeResults', () => {
  it('podium is top 3 by score', () => {
    const r = computeResults([
      { playerId: 'a', score: 5 },
      { playerId: 'b', score: 30 },
      { playerId: 'c', score: 10 },
      { playerId: 'd', score: 20 },
    ]);
    expect(r.podium).toEqual(['b', 'd', 'c']);
    expect(r.scores).toEqual({ a: 5, b: 30, c: 10, d: 20 });
  });
  it('ties go to whoever reached the score first', () => {
    const r = computeResults([
      { playerId: 'a', score: 10, scoreUpdatedAt: 500 },
      { playerId: 'b', score: 10, scoreUpdatedAt: 100 },
    ]);
    expect(r.podium).toEqual(['b', 'a']);
  });
  it('handles fewer than 3 players', () => {
    expect(computeResults([{ playerId: 'a', score: 1 }]).podium).toEqual(['a']);
  });
});
