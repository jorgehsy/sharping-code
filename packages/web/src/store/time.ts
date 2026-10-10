/** Clock helpers. Clocks are derived from server timestamps + a measured offset (docs/architecture.md). */

/** Offset such that serverNow = localNow + offset. `localNow` should be the midpoint of the request. */
export const clockOffset = (serverNow: number, localNow: number) => serverNow - localNow;

export const serverNow = (offset: number, localNow: number) => localNow + offset;

/** Remaining ms until `deadline` (never negative). */
export const remainingMs = (deadline: number, serverNowMs: number) => Math.max(0, deadline - serverNowMs);

/** m:ss, rounding up so "0:00" only shows when really over. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
