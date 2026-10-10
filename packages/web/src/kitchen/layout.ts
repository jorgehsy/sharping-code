/** Native scene size (16 px tiles); shown at scale 3. */
export const SCENE_W = 320;
export const SCENE_H = 192;
export const SCENE_SCALE = 3;

/** The floor in front of the counter fits this many customers side by side. */
export const MAX_SLOTS = 5;

/** Native x of customer slot `i`. */
export const slotX = (i: number) => 40 + i * 60;

/** x positions for the first `n` slots (n is clamped to what fits). */
export const slotXs = (n: number) => Array.from({ length: Math.max(0, Math.min(n, MAX_SLOTS)) }, (_, i) => slotX(i));

/**
 * Keeps every order in the slot it already has (customers never shuffle when another one leaves) and gives
 * new orders the lowest free slot. Orders that don't fit get no slot (they still show in the ticket rail).
 */
export function assignSlots(prev: ReadonlyMap<string, number>, orderIds: readonly string[], maxSlots = MAX_SLOTS): Map<string, number> {
  const next = new Map<string, number>();
  const used = new Set<number>();
  for (const id of orderIds) {
    const s = prev.get(id);
    if (s !== undefined && s < maxSlots && !used.has(s)) {
      next.set(id, s);
      used.add(s);
    }
  }
  for (const id of orderIds) {
    if (next.has(id)) continue;
    let s = 0;
    while (s < maxSlots && used.has(s)) s++;
    if (s >= maxSlots) continue;
    next.set(id, s);
    used.add(s);
  }
  return next;
}
