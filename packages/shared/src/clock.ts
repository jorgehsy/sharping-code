/** Input of the durable game clock execution. DurableExecutionName = gameCode. */
export interface ClockInput {
  gameCode: string;
  /** Epoch ms. */
  startedAt: number;
  rushAt: number;
  endsAt: number;
}

export const GAME_DURATION_MS = 15 * 60_000;
export const RUSH_DURATION_MS = 3 * 60_000;
