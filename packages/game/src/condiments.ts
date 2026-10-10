import type { Difficulty } from '@sharping/shared';
import { CONDIMENT_ON_FIRST_HARD_ONLY, MAX_CONDIMENTS } from './config.ts';

/** Whether a correct delivery earns a condiment. */
export const earnsCondiment = (difficulty: Difficulty, rank: number): boolean =>
  difficulty === 'hard' && (!CONDIMENT_ON_FIRST_HARD_ONLY || rank === 1);

/** Adds one condiment, capped at MAX_CONDIMENTS. */
export const addCondiment = (stored: number): number => Math.min(stored + 1, MAX_CONDIMENTS);
