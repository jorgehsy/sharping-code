import { parse } from "acorn";
import { simple } from "acorn-walk";
import type { SabotageRule } from "@sharping/shared";

/** A checker returns an error message if the rule is violated, else null. */
type Checker = (ctx: { originalSource: string; js: string }) => string | null;

const LOOP_NODES = ["ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement"] as const;

const noLoops: Checker = ({ js }) => {
  const ast = parse(js, { ecmaVersion: "latest", sourceType: "script" });
  let found: string | null = null;
  const visitors: Record<string, (n: any) => void> = {};
  for (const t of LOOP_NODES) visitors[t] = (n) => { found ??= `${t} at offset ${n.start}`; };
  simple(ast, visitors);
  return found && `Loops not allowed (${found})`;
};

const maxLines3: Checker = ({ originalSource }) => {
  const n = originalSource.split("\n").filter((l) => l.trim() !== "").length;
  return n > 3 ? `Max 3 lines allowed, got ${n}` : null;
};

export const SABOTAGE_RULES: Record<SabotageRule, Checker> = {
  "no-loops": noLoops,
  "max-lines-3": maxLines3,
};

export function checkSabotage(rule: SabotageRule, originalSource: string, js: string): string | null {
  const checker = SABOTAGE_RULES[rule];
  if (!checker) return `Unknown sabotage rule: ${rule}`;
  return checker({ originalSource, js });
}
