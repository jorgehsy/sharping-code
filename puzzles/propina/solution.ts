export function solve(total: number, pct: number): number {
  return Math.round((total * (100 + pct)) / 100);
}
