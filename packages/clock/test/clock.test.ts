import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LocalDurableTestRunner, OperationType } from '@aws/durable-execution-sdk-js-testing';
import { createClockHandler } from '../src/clock.ts';

describe('clock durable function', () => {
  beforeAll(() => LocalDurableTestRunner.setupTestEnvironment({ skipTime: true }));
  afterAll(() => LocalDurableTestRunner.teardownTestEnvironment());

  it('fires rush then finish, with durable waits in between', async () => {
    const fired: Array<[string, string[]]> = [];
    const handler = createClockHandler({
      fire: async (code, tick) => void fired.push([code, tick.actions.map((a) => a.kind)]),
      puzzles: [], // no order rotation here: just rush + finish
      waitMarginMs: 1000,
      maxResidualSleepMs: 0, // time is skipped in tests; never really sleep
    });
    const runner = new LocalDurableTestRunner({ handlerFunction: handler });
    const now = Date.now();
    const exec = await runner.run({
      payload: { gameCode: 'ABCD', startedAt: now, rushAt: now + 720_000, endsAt: now + 900_000 },
    });

    expect(exec.getStatus()).toBe('SUCCEEDED');
    expect(fired).toEqual([
      ['ABCD', ['rush']],
      ['ABCD', ['finish']],
    ]);
    const waits = exec.getOperations().filter((o) => o.getType() === OperationType.WAIT);
    expect(waits.length).toBeGreaterThan(0);
    expect(waits.length).toBeLessThanOrEqual(2);
  });

  it('runs the full order rotation: one step per tick, orders opened before finish', async () => {
    const ticks: string[][] = [];
    const handler = createClockHandler({
      fire: async (_code, tick) => void ticks.push(tick.actions.map((a) => a.kind)),
      puzzles: [
        { id: 'e', title: 'E', difficulty: 'easy' },
        { id: 'm', title: 'M', difficulty: 'medium' },
        { id: 'h', title: 'H', difficulty: 'hard' },
      ],
      waitMarginMs: 1000,
      maxResidualSleepMs: 0,
    });
    const runner = new LocalDurableTestRunner({ handlerFunction: handler });
    const now = Date.now();
    const exec = await runner.run({
      payload: { gameCode: 'ABCD', startedAt: now, rushAt: now + 720_000, endsAt: now + 900_000 },
    });
    expect(exec.getStatus()).toBe('SUCCEEDED');
    expect(ticks[0]!.filter((k) => k === 'open')).toHaveLength(5);
    expect(ticks.at(-1)).toEqual(['finish']);
    expect(ticks.flat().filter((k) => k === 'rush')).toHaveLength(1);
    expect(ticks.length).toBeLessThanOrEqual(30);
  });
});
