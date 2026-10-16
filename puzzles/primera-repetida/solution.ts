export function solve(s: string): string | null {
  const seen = new Set<string>();
  for (const c of s) {
    if (seen.has(c)) return c;
    seen.add(c);
  }
  return null;
}
