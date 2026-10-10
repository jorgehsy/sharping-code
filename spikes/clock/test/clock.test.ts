import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LocalDurableTestRunner, OperationType } from '@aws/durable-execution-sdk-js-testing';
import { createClockHandler } from '../src/clock.js';
import type { PublishedEvent } from '../src/schedule.js';

describe('clock durable function', () => {
  beforeAll(() => LocalDurableTestRunner.setupTestEnvironment({ skipTime: true }));
  afterAll(() => LocalDurableTestRunner.teardownTestEnvironment());

  it('publishes all events in order with correlative seq, ~1 wait per event', async () => {
    const published: { channel: string; ev: PublishedEvent }[] = [];
    const handler = createClockHandler({
      publish: async (channel, ev) => {
        published.push({ channel, ev });
      },
      waitMarginMs: 1000,
      maxResidualSleepMs: 0, // time is skipped in tests; never really sleep
    });
    const runner = new LocalDurableTestRunner({ handlerFunction: handler });
    const exec = await runner.run({ payload: { gameCode: 'ABCD', durationSec: 180 } });

    expect(exec.getStatus()).toBe('SUCCEEDED');
    const result = exec.getResult() as { events: number; waits: number };

    expect(published.every((p) => p.channel === '/game/ABCD')).toBe(true);
    const evs = published.map((p) => p.ev);
    expect(evs).toHaveLength(result.events);
    expect(evs.map((e) => e.seq)).toEqual(evs.map((_, i) => i + 1));
    expect(evs[0].type).toBe('game.started');
    expect(evs.at(-1)!.type).toBe('game.finished');
    expect(evs.some((e) => e.type === 'rush.started')).toBe(true);
    for (let i = 1; i < evs.length; i++) expect(evs[i].plannedAt).toBeGreaterThanOrEqual(evs[i - 1].plannedAt);

    const waitOps = exec
      .getOperations()
      .filter((o) => o.getType() === OperationType.WAIT);
    expect(waitOps.length).toBe(result.waits);
    // wait count bounded by events (no fixed tick), and > 0 for a 3-minute game
    expect(waitOps.length).toBeGreaterThan(0);
    expect(waitOps.length).toBeLessThanOrEqual(result.events);
  });

  it('defaults durationSec to 180', async () => {
    const evs: PublishedEvent[] = [];
    const handler = createClockHandler({ publish: async (_c, e) => void evs.push(e), maxResidualSleepMs: 0 });
    const runner = new LocalDurableTestRunner({ handlerFunction: handler });
    await runner.run({ payload: { gameCode: 'XY' } });
    const dur = evs.at(-1)!.plannedAt - evs[0].plannedAt;
    expect(dur).toBe(180_000);
  });
});
