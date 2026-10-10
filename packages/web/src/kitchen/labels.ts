import type { SabotageRule } from '@sharping/shared';

const RULES: Record<SabotageRule, string> = { 'no-loops': 'sin bucles', 'max-lines-3': 'máximo 3 líneas' };

const DIFFICULTIES: Record<string, string> = { easy: 'fácil', medium: 'media', hard: 'difícil' };

export const difficultyLabel = (d: string) => DIFFICULTIES[d] ?? d;

export const ruleLabel = (rule: SabotageRule | string) => RULES[rule as SabotageRule] ?? rule;
