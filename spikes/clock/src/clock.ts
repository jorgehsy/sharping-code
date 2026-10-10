import { withDurableExecution, type DurableContext } from '@aws/durable-execution-sdk-js';
import { buildSchedule, planWaitSeconds, toPublished, type Schedule } from './schedule.js';
import type { PublishFn } from './publish.js';

export interface ClockInput {
  gameCode: string;
  durationSec?: number;
}

export interface ClockDeps {
  publish: PublishFn;
  /** Wake this many ms before target; the remainder is slept inside the publish step. */
  waitMarginMs?: number;
  /** Max in-step sleep to hit the exact planned time. */
  maxResidualSleepMs?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createClockHandler(deps: ClockDeps) {
  const margin = deps.waitMarginMs ?? 1000;
  const maxResidual = deps.maxResidualSleepMs ?? 5000;

  return withDurableExecution(async (event: ClockInput, ctx: DurableContext) => {
    const gameCode = event.gameCode;
    const durationSec = event.durationSec ?? 180;
    const channel = `/game/${gameCode}`;

    // All non-determinism (Date.now, Math.random) lives in this step; its result is checkpointed.
    const schedule: Schedule = await ctx.step('build-schedule', async () =>
      buildSchedule({ gameCode, durationSec, now: Date.now(), random: Math.random }),
    );

    // Only step-recorded timestamps are used to compute waits (replay-safe).
    let lastKnown = schedule.t0;
    let waits = 0;
    const lags: number[] = [];

    for (const ev of schedule.events) {
      const w = planWaitSeconds(ev.plannedAt - lastKnown, margin);
      if (w > 0) {
        await ctx.wait(`wait-${ev.seq}`, { seconds: w });
        waits++;
      }

      const res = await ctx.step(`publish-${ev.seq}-${ev.type}`, async () => {
        const residual = ev.plannedAt - Date.now();
        if (residual > 0 && residual <= maxResidual) await sleep(residual);
        const at = Date.now();
        await deps.publish(channel, toPublished(ev, at));
        return { at };
      });

      lastKnown = res.at;
      lags.push(res.at - ev.plannedAt);
    }

    return { gameCode, events: schedule.events.length, waits, lagsMs: lags };
  });
}
