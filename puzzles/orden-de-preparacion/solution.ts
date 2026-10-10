export function solve(steps: string[], deps: [string, string][]): string[] | null {
  const indeg = new Map<string, number>(steps.map((s) => [s, 0]));
  const next = new Map<string, Set<string>>(steps.map((s) => [s, new Set()]));
  for (const [a, b] of deps) {
    if (next.get(a)!.has(b)) continue;
    next.get(a)!.add(b);
    indeg.set(b, indeg.get(b)! + 1);
  }
  const ready = steps.filter((s) => indeg.get(s) === 0);
  const out: string[] = [];
  while (ready.length > 0) {
    ready.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    const s = ready.shift()!;
    out.push(s);
    for (const n of next.get(s)!) {
      indeg.set(n, indeg.get(n)! - 1);
      if (indeg.get(n) === 0) ready.push(n);
    }
  }
  return out.length === steps.length ? out : null;
}
