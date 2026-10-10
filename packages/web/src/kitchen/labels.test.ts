import { describe, expect, it } from 'vitest';
import { ruleLabel } from './labels.ts';

describe('ruleLabel', () => {
  it('names the known rules and passes unknown ones through', () => {
    expect(ruleLabel('no-loops')).toBe('sin bucles');
    expect(ruleLabel('max-lines-3')).toBe('máximo 3 líneas');
    expect(ruleLabel('future-rule')).toBe('future-rule');
  });
});
