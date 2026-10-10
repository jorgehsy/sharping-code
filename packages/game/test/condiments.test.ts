import { describe, expect, it } from 'vitest';
import { addCondiment, earnsCondiment } from '../src/index.ts';

describe('condiments', () => {
  it('only the 1st delivery of a hard order earns one', () => {
    expect(earnsCondiment('hard', 1)).toBe(true);
    expect(earnsCondiment('hard', 2)).toBe(false);
    expect(earnsCondiment('medium', 1)).toBe(false);
    expect(earnsCondiment('easy', 1)).toBe(false);
  });
  it('stores at most 2', () => {
    expect(addCondiment(0)).toBe(1);
    expect(addCondiment(1)).toBe(2);
    expect(addCondiment(2)).toBe(2);
  });
});
