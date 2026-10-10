import { describe, expect, it } from 'vitest';
import { clockOffset, formatClock, remainingMs, serverNow } from './time.ts';

describe('countdown math', () => {
  it('derives server time from offset', () => {
    const off = clockOffset(10_000, 4_000);
    expect(off).toBe(6000);
    expect(serverNow(off, 5_000)).toBe(11_000);
  });
  it('remaining never goes negative', () => {
    expect(remainingMs(5000, 3000)).toBe(2000);
    expect(remainingMs(5000, 9000)).toBe(0);
  });
  it('formats m:ss rounding up', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(1)).toBe('0:01');
    expect(formatClock(61_000)).toBe('1:01');
    expect(formatClock(15 * 60_000)).toBe('15:00');
    expect(formatClock(-5)).toBe('0:00');
  });
});
