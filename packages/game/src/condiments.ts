import type { Difficulty } from '@sharping/shared';
import { CONDIMENT_ON_FIRST_HARD_ONLY, MAX_CONDIMENTS, SOLVES_PER_CONDIMENT } from './config.ts';

/** Whether a correct delivery earns a condiment. */
export const earnsCondiment = (difficulty: Difficulty, rank: number): boolean =>
  difficulty === 'hard' && (!CONDIMENT_ON_FIRST_HARD_ONLY || rank === 1);

/**
 * Condiments a correct delivery earns (0..2, before the cap): one for winning a hard order, one for every
 * SOLVES_PER_CONDIMENT-th correct delivery. `solved` counts correct deliveries including this one.
 */
export const condimentsEarned = (difficulty: Difficulty, rank: number, solved: number): number =>
  (earnsCondiment(difficulty, rank) ? 1 : 0) + (solved > 0 && solved % SOLVES_PER_CONDIMENT === 0 ? 1 : 0);

/** Adds one condiment, capped at MAX_CONDIMENTS. */
export const addCondiment = (stored: number): number => Math.min(stored + 1, MAX_CONDIMENTS);
