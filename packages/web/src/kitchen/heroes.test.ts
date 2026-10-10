import { describe, expect, it } from 'vitest';
import { chefX, heroForIndex, heroOf, HEROES } from './heroes.ts';

describe('heroes', () => {
  it('assigns by join order and wraps after 10', () => {
    expect(heroForIndex(0)).toBe('knight_m');
    expect(heroForIndex(9)).toBe('lizard_f');
    expect(heroForIndex(10)).toBe('knight_m');
    expect(HEROES).toHaveLength(10);
  });

  it('heroOf looks the player up in join order', () => {
    const players = [{ playerId: 'a' }, { playerId: 'b' }, { playerId: 'c' }];
    expect(heroOf(players, 'c')).toBe('dwarf_m');
    expect(heroOf(players, 'zzz')).toBe('knight_m');
  });

  it('spreads 10 chefs across the 320 px counter and centres smaller crews', () => {
    expect(chefX(0, 10)).toBe(20);
    expect(chefX(9, 10)).toBe(299);
    expect(chefX(0, 1)).toBe(160);
    const three = [0, 1, 2].map((i) => chefX(i, 3));
    expect(three).toEqual([129, 160, 191]);
  });
});
