export function solve(s: string): string {
  const seen = new Set<string>();
  let out = "";
  for (const c of s) {
    if (seen.has(c)) continue;
    seen.add(c);
    out += c;
  }
  return out;
}
