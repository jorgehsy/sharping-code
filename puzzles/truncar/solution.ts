export function solve(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "..." : s;
}
