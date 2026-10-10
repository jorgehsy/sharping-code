export const RANK_SHARES = [1, 0.6, 0.3] as const;
export const MAX_DELIVERIES = RANK_SHARES.length;
export const URGENT_MS = 30_000;

/** Points the next correct delivery would give (0 once all 3 spots are taken). */
export function nextPoints(order: { basePoints: number; deliveredBy: readonly string[] }, rush: boolean): number {
  const share = RANK_SHARES[order.deliveredBy.length];
  return share === undefined ? 0 : Math.round(order.basePoints * share * (rush ? 2 : 1));
}

/** Under 30 s left (and still open): the monster and its ticket shake red. */
export const isUrgent = (msLeft: number) => msLeft > 0 && msLeft < URGENT_MS;

export const isFull = (order: { deliveredBy: readonly string[] }) => order.deliveredBy.length >= MAX_DELIVERIES;
