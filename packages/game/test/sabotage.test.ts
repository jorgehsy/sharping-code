import { describe, expect, it } from 'vitest';
import { applySabotage, clearSabotage, pickSabotageRule, type SabotageState } from '../src/index.ts';

const armed: SabotageState = { condiments: 1, active: null };
const clean: SabotageState = { condiments: 0, active: null };
const base = { attackerId: 'a', targetId: 'b', attacker: armed, target: clean, rule: 'no-loops' as const };

describe('sabotage', () => {
  it('applies: spends a condiment and sticks the rule on the target', () => {
    expect(applySabotage(base)).toEqual({
      ok: true,
      attacker: { condiments: 0, active: null },
      target: { condiments: 0, active: 'no-loops' },
    });
  });
  it('requires a condiment', () => {
    expect(applySabotage({ ...base, attacker: clean })).toEqual({ ok: false, reason: 'no-condiment' });
  });
  it('cannot target self', () => {
    expect(applySabotage({ ...base, targetId: 'a' })).toEqual({ ok: false, reason: 'self' });
  });
  it('target holds at most 1 active sabotage', () => {
    expect(applySabotage({ ...base, target: { condiments: 0, active: 'max-lines-3' } })).toEqual({
      ok: false,
      reason: 'target-already-sabotaged',
    });
  });
  it('respects puzzle blockedSabotages', () => {
    expect(applySabotage({ ...base, blockedSabotages: ['no-loops'] })).toEqual({ ok: false, reason: 'blocked' });
    expect(applySabotage({ ...base, blockedSabotages: ['max-lines-3'] }).ok).toBe(true);
  });
  it('is cleared on next correct delivery', () => {
    expect(clearSabotage({ condiments: 1, active: 'no-loops' })).toEqual({ condiments: 1, active: null });
  });
});

describe('pickSabotageRule', () => {
  it('picks uniformly among allowed rules', () => {
    expect(pickSabotageRule([], () => 0)).toBe('no-loops');
    expect(pickSabotageRule([], () => 0.99)).toBe('max-lines-3');
  });
  it('skips blocked rules and returns undefined when all are blocked', () => {
    expect(pickSabotageRule(['no-loops'], () => 0)).toBe('max-lines-3');
    expect(pickSabotageRule(['no-loops', 'max-lines-3'])).toBeUndefined();
  });
});
