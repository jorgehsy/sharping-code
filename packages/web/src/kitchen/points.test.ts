import { describe, expect, it } from 'vitest';
import { isFull, isUrgent, nextPoints } from './points.ts';

const order = (n: number) => ({ basePoints: 200, deliveredBy: Array.from({ length: n }, (_, i) => `p${i}`) });

describe('nextPoints', () => {
  it('degrades 100% / 60% / 30%', () => {
    expect([0, 1, 2].map((n) => nextPoints(order(n), false))).toEqual([200, 120, 60]);
  });

  it('doubles in rush and is 0 when full', () => {
    expect([0, 1, 2].map((n) => nextPoints(order(n), true))).toEqual([400, 240, 120]);
    expect(nextPoints(order(3), true)).toBe(0);
    expect(nextPoints(order(3), false)).toBe(0);
  });

  it('rounds to whole points', () => {
    expect(nextPoints({ basePoints: 150, deliveredBy: ['a'] }, false)).toBe(90);
    expect(nextPoints({ basePoints: 105, deliveredBy: ['a', 'b'] }, false)).toBe(32);
  });
});

describe('urgency', () => {
  it('is urgent under 30 s while still open', () => {
    expect(isUrgent(29_999)).toBe(true);
    expect(isUrgent(30_000)).toBe(false);
    expect(isUrgent(0)).toBe(false);
  });
  it('isFull at 3 deliveries', () => {
    expect(isFull(order(2))).toBe(false);
    expect(isFull(order(3))).toBe(true);
  });
});
