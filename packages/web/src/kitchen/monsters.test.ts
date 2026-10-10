import { describe, expect, it } from 'vitest';
import { ALL_MONSTERS, hashString, MONSTERS, monsterFor } from './monsters.ts';

describe('monsterFor', () => {
  it('is deterministic', () => {
    expect(monsterFor('order-1', 'easy')).toBe(monsterFor('order-1', 'easy'));
    expect(hashString('abc')).toBe(hashString('abc'));
  });

  it('picks from the list of its difficulty', () => {
    for (let i = 0; i < 50; i++) {
      expect(MONSTERS.easy).toContain(monsterFor(`e${i}`, 'easy'));
      expect(MONSTERS.medium).toContain(monsterFor(`m${i}`, 'medium'));
      expect(MONSTERS.hard).toContain(monsterFor(`h${i}`, 'hard'));
    }
  });

  it('uses every monster of a difficulty across many orders', () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => monsterFor(`o${i}`, 'hard')));
    expect(seen.size).toBe(MONSTERS.hard.length);
    expect(ALL_MONSTERS).toHaveLength(11);
  });
});
