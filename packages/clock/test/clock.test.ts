import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LocalDurableTestRunner, OperationType, WaitingOperationStatus } from '@aws/durable-execution-sdk-js-testing';
import { createClockHandler, type ClockDeps } from '../src/clock.ts';
import type { ClockAction, OrderView } from '../src/schedule.ts';

const PUZZLES = [
  { id: 'e1', title: 'E1', difficulty: 'easy' as const },
  { id: 'e2', title: 'E2', difficulty: 'easy' as const },
  { id: 'm1', title: 'M1', difficulty: 'medium' as const },
  { id: 'm2', title: 'M2', difficulty: 'medium' as const },
  { id: 'h1', title: 'H1', difficulty: 'hard' as const },
  { id: 'h2', title: 'H2', difficulty: 'hard' as const },
];

/** In-memory game: virtual time (advanced by in-step sleeps), an orders "table" and a log of fired ticks. */
function fakeGame(startedAt: number) {
  let t = startedAt;
  const orders = new Map<string, OrderView>();
  const ticks: { at: number; kinds: ClockAction['kind'][]; opened: string[] }[] = [];
  const callbackIds: string[] = [];
  const deps = {
    puzzles: PUZZLES,
    waitMarginMs: 1000,
    maxResidualSleepMs: Number.MAX_SAFE_INTEGER, // time is skipped in tests: the in-step sleep moves the virtual clock
    now: () => t,
    sleep: async (ms: number): Promise<void> => void (t += ms),
    listOrders: async () => [...orders.values()],
    setCallbackId: async (_code: string, id: string) => void callbackIds.push(id),
    fire: async (_code: string, tick: { plannedAt: number; actions: ClockAction[] }) => {
      const opened: string[] = [];
      for (const a of tick.actions) {
        if (a.kind === 'open') {
          opened.push(a.order.orderId);
          orders.set(a.order.orderId, { orderId: a.order.orderId, puzzleId: a.order.puzzleId, expiresAt: a.order.expiresAt, deliveries: 0 });
        }
      }
      ticks.push({ at: tick.plannedAt, kinds: tick.actions.map((a) => a.kind), opened });
    },
  } satisfies ClockDeps;
  return { deps, orders, ticks, callbackIds, advance: (ms: number) => void (t += ms), time: () => t };
}

describe('reactive clock durable function', () => {
  beforeAll(() => LocalDurableTestRunner.setupTestEnvironment({ skipTime: true }));
  afterAll(() => LocalDurableTestRunner.teardownTestEnvironment());

  // The local test server times callbacks out in REAL seconds (skipTime only affects ctx.wait), so these games are short.
  it('timeout path: callback timeouts are the normal path; rush and finish fire at their times', async () => {
    const startedAt = Date.now();
    const game = fakeGame(startedAt);
    const runner = new LocalDurableTestRunner({ handlerFunction: createClockHandler({ ...game.deps, now: Date.now, sleep: undefined, waitMarginMs: 0, maxResidualSleepMs: 1500 }) });
    const exec = await runner.run({
      payload: { gameCode: 'ABCD', startedAt, rushAt: startedAt + 2_000, endsAt: startedAt + 4_000 },
    });
    expect(exec.getStatus()).toBe('SUCCEEDED');
    expect(game.ticks.map((t) => t.kinds)).toEqual([['rush'], ['finish']]);
    expect(game.ticks[0]!.at).toBeGreaterThanOrEqual(startedAt + 2_000);
    expect(game.ticks[1]!.at).toBeGreaterThanOrEqual(startedAt + 4_000);
    // Unique per-iteration names; one wake (callback with timeout) per tick that has something to wait for.
    const names = exec.getOperations().map((o) => o.getName());
    expect(names).toEqual(expect.arrayContaining(['tick-0', 'wake-0', 'tick-1', 'wake-1', 'tick-2']));
  }, 20_000);

  it('residual under 1 s: no wait, the tick sleeps the rest', async () => {
    const startedAt = 5_000_000;
    const game = fakeGame(startedAt);
    const runner = new LocalDurableTestRunner({ handlerFunction: createClockHandler({ ...game.deps, puzzles: [] }) });
    const exec = await runner.run({
      payload: { gameCode: 'ABCD', startedAt, rushAt: startedAt + 500, endsAt: startedAt + 900 },
    });
    expect(exec.getStatus()).toBe('SUCCEEDED');
    expect(game.ticks.map((t) => t.kinds)).toEqual([['rush'], ['finish']]);
    expect(game.callbackIds).toEqual([]);
    expect(exec.getOperations().every((o) => o.getType() === OperationType.STEP)).toBe(true);
  });

  it('callback path: the API completing wake-0 refills a full order right away', async () => {
    const startedAt = 5_000_000;
    const game = fakeGame(startedAt);
    const runner = new LocalDurableTestRunner({ handlerFunction: createClockHandler(game.deps) });
    const wake0 = runner.getOperation('wake-0');
    const exec = runner.run({
      payload: { gameCode: 'ABCD', startedAt, rushAt: startedAt + 720_000, endsAt: startedAt + 900_000 },
    });

    await wake0.waitForData(WaitingOperationStatus.SUBMITTED);
    expect(game.callbackIds.length).toBeGreaterThan(0);
    // 3 deliveries on o01 at t+20 s: the order is full, nothing expired.
    game.advance(20_000);
    game.orders.set('o01', { ...game.orders.get('o01')!, deliveries: 3 });
    const before = game.ticks.length;
    await wake0.sendCallbackSuccess('full');
    // The next callback (wake-1) proves the loop ticked again; finish the test by letting it run to the end.
    await runner.getOperation('wake-1').waitForData(WaitingOperationStatus.SUBMITTED);
    const refill = game.ticks[before]!;
    expect(refill.kinds).toEqual(['open']);
    expect(refill.opened).toEqual(['o06']);
    expect(refill.at).toBe(startedAt + 20_000);
    expect(game.ticks.flatMap((t) => t.kinds)).not.toContain('expire');
    game.advance(900_000); // past endsAt: the next (spurious) wake finds the game over and finishes
    await runner.getOperation('wake-1').sendCallbackSuccess('full');
    const result = await exec;
    expect(result.getStatus()).toBe('SUCCEEDED');
    // The full order o01 is never reported as expired: 4 expiries (o02..o05) + o06 remain at the end.
    expect(game.ticks.at(-1)!.kinds.filter((k) => k === 'expire')).toHaveLength(5);
    expect(game.ticks.at(-1)!.kinds.slice(-2)).toEqual(['rush', 'finish']);
  }, 20_000);
});
