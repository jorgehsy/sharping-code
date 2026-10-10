import type { Difficulty } from '@sharping/shared';

// TODO: confirm (open decision in docs/game-design.md)
export const BASE_POINTS: Record<Difficulty, number> = { easy: 100, medium: 200, hard: 400 };

/** Multiplier per delivery rank (1-based). 4th and beyond score nothing. */
export const RANK_MULTIPLIERS: readonly number[] = [1, 0.6, 0.3];

export const RUSH_MULTIPLIER = 2;
export const BURNED_DISH_PENALTY = 10;

export const ORDER_CLOCK_MS: Record<Difficulty, number> = {
  easy: 3 * 60_000,
  medium: 6 * 60_000,
  hard: 10 * 60_000,
};

export const MAX_CONDIMENTS = 2;
/** Assumption pending confirmation: only the 1st delivery of a hard order earns a condiment. */
export const CONDIMENT_ON_FIRST_HARD_ONLY = true;
