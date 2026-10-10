import { CallbackTimeoutError, withDurableExecution, type DurableContext } from '@aws/durable-execution-sdk-js';
import type { ClockInput, Scores } from '@sharping/shared';
import { PUZZLES, type PuzzleRef } from './game.ts';
import { decideTick, initialClockState, planWaitSeconds, type OrderView, type PlannedTick } from './schedule.ts';

export interface ClockDeps {
  /** Runs the actions of a tick (writes ORDER# items, reserves seq, publishes). Called only inside a step. */
  fire: (gameCode: string, tick: PlannedTick) => Promise<void>;
  /** Orders of the game (all of them, expired included) with their current delivery count. Called only inside a step. */
  listOrders: (gameCode: string) => Promise<OrderView[]>;
  /** Stores the callback id the API uses to wake the clock early (META.clockCallbackId). Called from the waitForCallback submitter. */
  setCallbackId: (gameCode: string, callbackId: string) => Promise<void>;
  /** Puzzle pool for order rotation. Default: the bundled catalog. */
  puzzles?: readonly PuzzleRef[];
  /** Wake this many ms before target; the remainder is slept inside the step. */
  waitMarginMs?: number;
  /** Max in-step sleep to hit the exact planned time. */
  maxResidualSleepMs?: number;
  /**
   * Longest wait between ticks. A wake-up from the API can be lost (sent while a tick runs, or to the previous,
   * already consumed callback id); the cap bounds how late that refill can be.
   */
  maxIdleSeconds?: number;
  /** Clock and sleep, injectable for tests. Only used inside steps. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type { Scores };

/**
 * Reactive clock (ADR 0002, update): loop of `tick-i` steps (read orders, decide, persist, emit) separated by
 * `wake-i` callbacks. The wait ends when the API reports the 3rd delivery of an order (the slot is free: refill) or
 * when the callback times out (the next timed event is due: normal path).
 */
export function createClockHandler(deps: ClockDeps) {
  const margin = deps.waitMarginMs ?? 1000;
  const maxResidual = deps.maxResidualSleepMs ?? 8000;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? realSleep;
  const puzzles = deps.puzzles ?? PUZZLES;
  const maxIdle = deps.maxIdleSeconds ?? 30;

  return withDurableExecution(async (event: ClockInput, ctx: DurableContext) => {
    let state = initialClockState(event);
    let timedWake = false; // woken by the timeout (not by the API): sleep the residual to hit the target time
    let nextWakeAt: number | null = event.startedAt;
    let lastKnown = event.startedAt; // only step-recorded timestamps feed wait computation (replay-safe)
    const lagsMs: number[] = [];
    let ticks = 0;

    for (let i = 0; ; i++) {
      ticks++;
      const target = nextWakeAt;
      const sleepUntil = timedWake ? target : null;
      const res = await ctx.step(`tick-${i}`, async () => {
        if (sleepUntil !== null) {
          const residual = sleepUntil - now();
          if (residual > 0 && residual <= maxResidual) await sleep(residual);
        }
        const at = now();
        const orders = await deps.listOrders(event.gameCode);
        const decision = decideTick({ now: at, orders, state, puzzles, input: event });
        if (decision.actions.length > 0) await deps.fire(event.gameCode, { plannedAt: at, actions: decision.actions });
        return { at, state: decision.state, nextWakeAt: decision.nextWakeAt };
      });

      state = res.state;
      nextWakeAt = res.nextWakeAt;
      lastKnown = res.at;
      // Only ticks that were due (an idle-cap wake fires before its target and is not a lag sample).
      if (target !== null && timedWake && res.at >= target) lagsMs.push(res.at - target);
      if (state.finished || nextWakeAt === null) break;

      const w = Math.min(planWaitSeconds(nextWakeAt - lastKnown, margin), maxIdle);
      timedWake = true;
      if (w > 0) {
        try {
          await ctx.waitForCallback(`wake-${i}`, (callbackId) => deps.setCallbackId(event.gameCode, callbackId), { timeout: { seconds: w } });
          timedWake = false; // the API woke us: a slot is free, tick now
        } catch (e) {
          if (!(e instanceof CallbackTimeoutError) && (e as { errorType?: string }).errorType !== 'CallbackTimeoutError') throw e; // timeout is the normal path
        }
      }
    }

    return { gameCode: event.gameCode, ticks, lagsMs };
  });
}
