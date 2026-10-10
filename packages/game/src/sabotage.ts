import type { SabotageRule } from '@sharping/shared';

export interface SabotageState {
  condiments: number;
  /** Currently stuck sabotage, if any. */
  active: SabotageRule | null;
}

export type SabotageRefusal = 'self' | 'no-condiment' | 'target-already-sabotaged' | 'blocked';

export type SabotageResult =
  | { ok: true; attacker: SabotageState; target: SabotageState }
  | { ok: false; reason: SabotageRefusal };

export interface ApplySabotageInput {
  attackerId: string;
  targetId: string;
  attacker: SabotageState;
  target: SabotageState;
  rule: SabotageRule;
  /** `blockedSabotages` of the puzzle the target is cooking, if any. */
  blockedSabotages?: readonly string[];
}

export const applySabotage = (i: ApplySabotageInput): SabotageResult => {
  if (i.attackerId === i.targetId) return { ok: false, reason: 'self' };
  if (i.attacker.condiments < 1) return { ok: false, reason: 'no-condiment' };
  if (i.target.active !== null) return { ok: false, reason: 'target-already-sabotaged' };
  if (i.blockedSabotages?.includes(i.rule)) return { ok: false, reason: 'blocked' };
  return {
    ok: true,
    attacker: { ...i.attacker, condiments: i.attacker.condiments - 1 },
    target: { ...i.target, active: i.rule },
  };
};

/** Called on the player's next correct delivery. */
export const clearSabotage = (state: SabotageState): SabotageState => ({ ...state, active: null });

/** Every rule the runner can enforce. Keep in sync with `SabotageRule` (the type forces it). */
export const SABOTAGE_RULES: readonly SabotageRule[] = ['no-loops', 'max-lines-3'];

/**
 * Picks the rule for a sabotage: uniformly random among the rules the target's puzzle does not block.
 * `random` is injected (returns [0,1)). Returns undefined when every rule is blocked.
 */
export const pickSabotageRule = (
  blocked: readonly string[] = [],
  random: () => number = Math.random,
): SabotageRule | undefined => {
  const options = SABOTAGE_RULES.filter((r) => !blocked.includes(r));
  return options[Math.floor(random() * options.length)];
};
