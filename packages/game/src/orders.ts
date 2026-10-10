import type { Difficulty } from '@sharping/shared';
import { ORDER_CLOCK_MS } from './config.ts';

export interface OrderClock {
  expiresAt: number;
}

export const expiresAt = (openedAt: number, difficulty: Difficulty): number => openedAt + ORDER_CLOCK_MS[difficulty];

/** Open until the clock runs out ("el cliente se va" at expiresAt). */
export const isOpen = (order: OrderClock, now: number): boolean => now < order.expiresAt;
