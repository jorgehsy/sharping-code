import { describe, expect, it } from 'vitest';
import { FULL_HOLD_MS, LEAVE_MS, ticketPhase } from './tickets.ts';

describe('ticketPhase', () => {
  it('is shown while the order is not full', () => {
    expect(ticketPhase(null, 123456)).toBe('show');
  });
  it('holds, falls, then hides once full', () => {
    expect(ticketPhase(1000, 1000 + FULL_HOLD_MS - 1)).toBe('show');
    expect(ticketPhase(1000, 1000 + FULL_HOLD_MS)).toBe('leave');
    expect(ticketPhase(1000, 1000 + FULL_HOLD_MS + LEAVE_MS)).toBe('hidden');
  });
  it('an order that was already full when first seen is hidden at once', () => {
    expect(ticketPhase(-Infinity, 5)).toBe('hidden');
  });
});
