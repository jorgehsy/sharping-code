/** How long a full (3/3) ticket stays while the monster is happy, then how long its fall animation lasts. */
export const FULL_HOLD_MS = 1100;
export const LEAVE_MS = 400;

export type TicketPhase = 'show' | 'leave' | 'hidden';

/**
 * Lifecycle of a ticket after its order got its 3rd delivery. `fullAt` is when we saw it fill up;
 * `-Infinity` means it was already full when first seen (nothing to animate: hide), `null` means not full.
 * The API keeps listing full orders until they expire, hence the need to hide them here.
 */
export function ticketPhase(fullAt: number | null, now: number): TicketPhase {
  if (fullAt === null) return 'show';
  const elapsed = now - fullAt;
  if (elapsed < FULL_HOLD_MS) return 'show';
  if (elapsed < FULL_HOLD_MS + LEAVE_MS) return 'leave';
  return 'hidden';
}
