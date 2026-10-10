import { describe, expect, it } from 'vitest';
import { expiresAt, isOpen } from '../src/index.ts';

describe('orders', () => {
  it('expiresAt uses difficulty clocks', () => {
    expect(expiresAt(0, 'easy')).toBe(180_000);
    expect(expiresAt(1000, 'medium')).toBe(361_000);
    expect(expiresAt(0, 'hard')).toBe(600_000);
  });
  it('isOpen until expiresAt (exclusive)', () => {
    const order = { expiresAt: 100 };
    expect(isOpen(order, 99)).toBe(true);
    expect(isOpen(order, 100)).toBe(false);
  });
});
