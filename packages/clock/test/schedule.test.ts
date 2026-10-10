import { describe, it, expect } from 'vitest';
import { ORDER_CLOCK_MS } from '../src/game.ts';
import {
  computeResults,
  decideTick,
  initialClockState,
  MIN_CLOCK_FRACTION,
  ORDER_SLOTS,
  planWaitSeconds,
  seededRng,
  type ClockAction,
  type ClockState,
  type OrderView,
  type PlannedOrder,
} from '../src/schedule.ts';

const PUZZLES = [
  { id: 'e1', title: 'E1', difficulty: 'easy' as const },
  { id: 'e2', title: 'E2', difficulty: 'easy' as const },
  { id: 'm1', title: 'M1', difficulty: 'medium' as const },
  { id: 'h1', title: 'H1', difficulty: 'hard' as const },
  { id: 'h2', title: 'H2', difficulty: 'hard' as const },
];
const T0 = 1_000_000;
const input = { gameCode: 'ABCDE', startedAt: T0, rushAt: T0 + 720_000, endsAt: T0 + 900_000 };
const view = (orderId: string, o: Partial<OrderView> = {}): OrderView => ({ orderId, puzzleId: `p-${orderId}`, expiresAt: T0 + 100_000, deliveries: 0, ...o });
const kinds = (a: ClockAction[]) => a.map((x) => x.kind);
const opens = (a: ClockAction[]): PlannedOrder[] => a.flatMap((x) => (x.kind === 'open' ? [x.order] : []));
const tick = (now: number, orders: OrderView[], state: ClockState, puzzles = PUZZLES) => decideTick({ now, orders, state, puzzles, input });
/** A state after an initial fill, `lastTickAt` at `at`. */
const afterFill = (at = T0, counter = 5): ClockState => ({ ...initialClockState(input), counter, lastTickAt: at });
const fiveOrders = (o: Partial<OrderView> = {}) => Array.from({ length: 5 }, (_, i) => view(`o0${i + 1}`, o));

describe('seededRng', () => {
  it('is deterministic per seed and in [0,1)', () => {
    const a = seededRng('X'), b = seededRng('X'), c = seededRng('Y');
    const xs = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(xs);
    expect(Array.from({ length: 5 }, c)).not.toEqual(xs);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
  });
});

describe('decideTick', () => {
  it('initial fill: ORDER_SLOTS orders with INITIAL_MIX, ids o01.., unique puzzles per difficulty while possible', () => {
    const d = tick(T0, [], initialClockState(input));
    expect(kinds(d.actions)).toEqual(Array(ORDER_SLOTS).fill('open'));
    const os = opens(d.actions);
    expect(os.map((o) => o.difficulty)).toEqual(['easy', 'easy', 'medium', 'medium', 'hard']);
    expect(os.map((o) => o.orderId)).toEqual(['o01', 'o02', 'o03', 'o04', 'o05']);
    expect(new Set(os.filter((o) => o.difficulty === 'easy').map((o) => o.puzzleId)).size).toBe(2);
    for (const o of os) {
      expect(o.openedAt).toBe(T0);
      expect(o.expiresAt).toBe(T0 + ORDER_CLOCK_MS[o.difficulty]);
    }
    expect(d.state.counter).toBe(5);
    expect(d.nextWakeAt).toBe(Math.min(...os.map((o) => o.expiresAt)));
  });

  it('is deterministic, and the rng depends on the game code', () => {
    const a = tick(T0, [], initialClockState(input));
    expect(tick(T0, [], initialClockState(input))).toEqual(a);
    const b = decideTick({ now: T0, orders: [], state: initialClockState(input), puzzles: PUZZLES, input: { ...input, gameCode: 'ZZZZZ' } });
    expect(b.actions).not.toEqual(a.actions);
  });

  it('refill after an order becomes full (3 deliveries) before its expiry: opens one, emits no expiry', () => {
    const orders = [view('o01', { deliveries: 3 }), ...fiveOrders().slice(1)];
    const d = tick(T0 + 20_000, orders, afterFill(T0));
    expect(kinds(d.actions)).toEqual(['open']);
    expect(opens(d.actions)[0]!.orderId).toBe('o06');
    expect(opens(d.actions)[0]!.openedAt).toBe(T0 + 20_000);
    expect(d.state.counter).toBe(6);
  });

  it('refill after expiry: expired before opened, one per freed slot', () => {
    const orders = [view('o02', { expiresAt: T0 + 10_000 }), view('o01', { expiresAt: T0 + 10_000 }), ...fiveOrders().slice(2)];
    const d = tick(T0 + 10_000, orders, afterFill(T0));
    expect(kinds(d.actions)).toEqual(['expire', 'expire', 'open', 'open']);
    expect(d.actions.slice(0, 2)).toEqual([
      { kind: 'expire', orderId: 'o01' },
      { kind: 'expire', orderId: 'o02' },
    ]);
  });

  it('a full order past its expiresAt produces no expire event (and frees nothing twice)', () => {
    const orders = [view('o01', { deliveries: 3, expiresAt: T0 + 50_000 }), ...fiveOrders().slice(1)];
    // o01 was already refilled at the 3rd delivery: 4 live + the replacement o06.
    const withRefill = [...orders, view('o06', { expiresAt: T0 + 400_000 })];
    const d = tick(T0 + 50_000, withRefill, afterFill(T0 + 20_000, 6));
    expect(kinds(d.actions)).toEqual([]);
  });

  it('an expiry is reported once: only in (lastTickAt, now]', () => {
    const orders = [view('o01', { expiresAt: T0 + 10_000 }), ...fiveOrders().slice(1)];
    const first = tick(T0 + 10_000, orders, afterFill(T0));
    expect(kinds(first.actions)).toEqual(['expire', 'open']);
    const again = tick(T0 + 30_000, [...orders, view('o06')], first.state);
    expect(kinds(again.actions)).not.toContain('expire');
  });

  it('does nothing when all slots are taken and nothing is due; wakes at the earliest non-full expiry', () => {
    const orders = [
      view('o01', { expiresAt: T0 + 30_000, deliveries: 3 }), // full: ignored for the wake time (and refilled)
      view('o02', { expiresAt: T0 + 90_000 }),
      view('o03', { expiresAt: T0 + 60_000 }),
      view('o04'),
      view('o05'),
      view('o06'),
    ];
    const d = tick(T0 + 5_000, orders, afterFill(T0, 6));
    expect(d.actions).toEqual([]);
    expect(d.nextWakeAt).toBe(T0 + 60_000);
  });

  it('opens nothing when no difficulty fits before the end; the slot stays empty', () => {
    const now = input.endsAt - ORDER_CLOCK_MS.easy * MIN_CLOCK_FRACTION + 1;
    const d = tick(now, [], afterFill(T0, 5));
    expect(opens(d.actions)).toEqual([]);
    expect(d.nextWakeAt).toBe(input.rushAt <= now ? input.endsAt : input.rushAt);
  });

  it('caps expiresAt at endsAt and does not wake for orders ending with the game', () => {
    const now = input.endsAt - ORDER_CLOCK_MS.easy; // easy fits entirely; medium/hard fit >= 50 % but are capped
    const d = tick(now, [], { ...afterFill(T0, 10), rushDone: true });
    expect(opens(d.actions).length).toBe(ORDER_SLOTS);
    for (const o of opens(d.actions)) expect(o.expiresAt).toBeLessThanOrEqual(input.endsAt);
    expect(opens(d.actions).some((o) => o.expiresAt === input.endsAt)).toBe(true);
    expect(d.nextWakeAt).toBe(input.endsAt);
  });

  it('rush once, at rushAt', () => {
    const orders = fiveOrders({ expiresAt: input.endsAt });
    const before = tick(input.rushAt - 1, orders, afterFill(T0));
    expect(kinds(before.actions)).toEqual([]);
    expect(before.nextWakeAt).toBe(input.rushAt);
    const at = tick(input.rushAt, orders, afterFill(T0));
    expect(kinds(at.actions)).toEqual(['rush']);
    expect(at.state.rushDone).toBe(true);
    const later = tick(input.rushAt + 5_000, orders, at.state);
    expect(kinds(later.actions)).not.toContain('rush');
    expect(later.nextWakeAt).toBe(input.endsAt);
  });

  it('finish closes: no expiry for capped orders, no openings, no further wake', () => {
    const orders = fiveOrders({ expiresAt: input.endsAt });
    const d = tick(input.endsAt, orders, { ...afterFill(T0), rushDone: true });
    expect(kinds(d.actions)).toEqual(['finish']);
    expect(d.state.finished).toBe(true);
    expect(d.nextWakeAt).toBeNull();
    expect(kinds(tick(input.endsAt + 1000, orders, d.state).actions)).toEqual([]);
  });

  it('rush and finish after a very late tick come out in order, after expiries/openings', () => {
    const d = tick(input.endsAt, fiveOrders({ expiresAt: input.endsAt - 100_000 }), afterFill(T0));
    expect(kinds(d.actions)).toEqual(['expire', 'expire', 'expire', 'expire', 'expire', 'rush', 'finish']);
  });

  it('never opens a puzzle that is currently open while the pool has others', () => {
    const live = [view('o01', { puzzleId: 'e1' }), view('o02', { puzzleId: 'h1' })];
    for (let c = 0; c < 20; c++) {
      const d = decideTick({ now: T0 + 1000, orders: live, state: { ...afterFill(T0, 2 + c), used: { e1: 1, h1: 1 } }, puzzles: PUZZLES, input });
      const first = new Map<string, string>();
      for (const o of opens(d.actions)) if (!first.has(o.difficulty)) first.set(o.difficulty, o.puzzleId);
      if (first.has('easy')) expect(first.get('easy')).toBe('e2');
      if (first.has('hard')) expect(first.get('hard')).toBe('h2');
      if (first.has('medium')) expect(first.get('medium')).toBe('m1');
    }
  });

  it('least-used puzzle first; repeats only when the pool is exhausted', () => {
    const state = { ...afterFill(T0, 8), used: { e1: 3, e2: 1, m1: 0 } };
    const d = decideTick({ now: T0 + 1, orders: fiveOrders().slice(1), state, puzzles: PUZZLES.filter((p) => p.difficulty === 'easy'), input });
    expect(opens(d.actions)[0]!.puzzleId).toBe('e2');
    const tiny = decideTick({ now: T0 + 1, orders: [view('o02', { puzzleId: 'e1' })], state: afterFill(T0, 8), puzzles: [PUZZLES[0]!], input });
    expect(opens(tiny.actions).length).toBe(4); // repeats e1 because it is the only one
  });

  it('an empty catalog opens nothing (rush and finish only)', () => {
    const d = tick(T0, [], initialClockState(input), []);
    expect(d.actions).toEqual([]);
    expect(d.nextWakeAt).toBe(input.rushAt);
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
