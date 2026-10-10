import { describe, expect, it } from 'vitest';
import { assignSlots, MAX_SLOTS, slotX, slotXs } from './layout.ts';

describe('slots', () => {
  it('slotXs gives increasing x inside the 320 px scene, clamped to what fits', () => {
    expect(slotXs(0)).toEqual([]);
    expect(slotXs(3)).toEqual([40, 100, 160]);
    expect(slotXs(99)).toHaveLength(MAX_SLOTS);
    expect(slotX(MAX_SLOTS - 1)).toBeLessThan(320);
  });

  it('assigns the lowest free slot to new orders', () => {
    const m = assignSlots(new Map(), ['a', 'b', 'c']);
    expect([...m]).toEqual([['a', 0], ['b', 1], ['c', 2]]);
  });

  it('keeps existing slots when others leave, and reuses the freed one', () => {
    const first = assignSlots(new Map(), ['a', 'b', 'c']);
    const second = assignSlots(first, ['a', 'c']);
    expect(second.get('a')).toBe(0);
    expect(second.get('c')).toBe(2);
    expect(assignSlots(second, ['a', 'c', 'd']).get('d')).toBe(1);
  });

  it('orders beyond the capacity get no slot', () => {
    const ids = Array.from({ length: MAX_SLOTS + 2 }, (_, i) => `o${i}`);
    const m = assignSlots(new Map(), ids);
    expect(m.size).toBe(MAX_SLOTS);
    expect(m.has(`o${MAX_SLOTS}`)).toBe(false);
  });
});
