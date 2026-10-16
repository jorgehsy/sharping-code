import { describe, expect, it } from 'vitest';
import { addCondiment, condimentsEarned, earnsCondiment } from '../src/index.ts';

describe('condiments', () => {
  it('only the 1st delivery of a hard order earns one', () => {
    expect(earnsCondiment('hard', 1)).toBe(true);
    expect(earnsCondiment('hard', 2)).toBe(false);
    expect(earnsCondiment('medium', 1)).toBe(false);
    expect(earnsCondiment('easy', 1)).toBe(false);
  });
  it('every 3rd correct delivery earns one, on top of the hard one', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => condimentsEarned('easy', 2, n))).toEqual([0, 0, 1, 0, 0, 1]);
    expect(condimentsEarned('easy', 4, 3)).toBe(1); // a correct but unranked delivery still counts
    expect(condimentsEarned('hard', 1, 1)).toBe(1);
    expect(condimentsEarned('hard', 1, 3)).toBe(2);
  });
  it('stores at most 2', () => {
    expect(addCondiment(0)).toBe(1);
    expect(addCondiment(1)).toBe(2);
    expect(addCondiment(2)).toBe(2);
  });
});
