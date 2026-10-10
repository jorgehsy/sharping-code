import { withDurableExecution, type DurableContext } from '@aws/durable-execution-sdk-js';
import type { ClockInput, Scores } from '@sharping/shared';
import type { PuzzleRef } from './game.ts';
import { buildSchedule, planWaitSeconds, type PlannedTick } from './schedule.ts';

export interface ClockDeps {
  /** Runs the actions of a tick (writes ORDER# items, reserves seq, publishes). Called only inside a step. */
  fire: (gameCode: string, tick: PlannedTick) => Promise<void>;
  /** Puzzle pool for order rotation. Default: the bundled catalog. */
  puzzles?: readonly PuzzleRef[];
  /** Wake this many ms before target; the remainder is slept inside the step. */
  waitMarginMs?: number;
  /** Max in-step sleep to hit the exact planned time. */
  maxResidualSleepMs?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type { Scores };

export function createClockHandler(deps: ClockDeps) {
  const margin = deps.waitMarginMs ?? 1000;
  const maxResidual = deps.maxResidualSleepMs ?? 8000;

  return withDurableExecution(async (event: ClockInput, ctx: DurableContext) => {
    // Pure and seeded by the game code: identical on every replay.
    const schedule = deps.puzzles ? buildSchedule(event, deps.puzzles) : buildSchedule(event);

    // Only step-recorded timestamps feed wait computation (replay-safe).
    let lastKnown = event.startedAt;
    const lagsMs: number[] = [];

    for (const [i, tick] of schedule.entries()) {
      const w = planWaitSeconds(tick.plannedAt - lastKnown, margin);
      if (w > 0) await ctx.wait(`wait-${i}`, { seconds: w });

      const res = await ctx.step(`tick-${i}`, async () => {
        const residual = tick.plannedAt - Date.now();
        if (residual > 0 && residual <= maxResidual) await sleep(residual);
        const at = Date.now();
        await deps.fire(event.gameCode, tick);
        return { at };
      });

      lastKnown = res.at;
      lagsMs.push(res.at - tick.plannedAt);
    }

    return { gameCode: event.gameCode, ticks: schedule.length, lagsMs };
  });
}
