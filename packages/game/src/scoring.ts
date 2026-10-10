import type { Difficulty } from '@sharping/shared';
import { BASE_POINTS, BURNED_DISH_PENALTY, RANK_MULTIPLIERS, RUSH_MULTIPLIER } from './config.ts';

export const basePoints = (difficulty: Difficulty): number => BASE_POINTS[difficulty];

/** Rank is 1-based; ranks beyond the table give 0. */
export const rankMultiplier = (rank: number): number => RANK_MULTIPLIERS[rank - 1] ?? 0;

export const isRushHour = (at: number, rushAt: number): boolean => at >= rushAt;

export interface DeliveryInput {
  difficulty: Difficulty;
  /** 1-based position among correct deliveries of this order. */
  rank: number;
  /** Epoch ms of the delivery. */
  deliveredAt: number;
  rushAt: number;
}

export const deliveryPoints = ({ difficulty, rank, deliveredAt, rushAt }: DeliveryInput): number => {
  const points = basePoints(difficulty) * rankMultiplier(rank);
  return isRushHour(deliveredAt, rushAt) ? points * RUSH_MULTIPLIER : points;
};

/** Negative score delta for a failed delivery. */
export const burnedDishPoints = (): number => -BURNED_DISH_PENALTY;
