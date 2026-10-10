import { describe, expect, it } from 'vitest';
import { basePoints, burnedDishPoints, deliveryPoints, isRushHour, rankMultiplier } from '../src/index.ts';

const rushAt = 1000;
const d = (difficulty: 'easy' | 'medium' | 'hard', rank: number, deliveredAt = 0) =>
  deliveryPoints({ difficulty, rank, deliveredAt, rushAt });

describe('scoring', () => {
  it('base points per difficulty', () => {
    expect([basePoints('easy'), basePoints('medium'), basePoints('hard')]).toEqual([100, 200, 400]);
  });
  it('rank multipliers 100/60/30 then 0', () => {
    expect([1, 2, 3, 4, 9].map(rankMultiplier)).toEqual([1, 0.6, 0.3, 0, 0]);
  });
  it('delivery points = base * rank multiplier', () => {
    expect(d('easy', 1)).toBe(100);
    expect(d('medium', 2)).toBe(120);
    expect(d('hard', 3)).toBeCloseTo(120);
    expect(d('hard', 4)).toBe(0);
  });
  it('rush hour starts at rushAt (inclusive) and doubles points', () => {
    expect(isRushHour(999, rushAt)).toBe(false);
    expect(isRushHour(1000, rushAt)).toBe(true);
    expect(d('easy', 1, 1000)).toBe(200);
    expect(d('easy', 2, 999)).toBe(60);
  });
  it('burned dish costs 10', () => {
    expect(burnedDishPoints()).toBe(-10);
  });
});
