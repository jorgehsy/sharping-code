export function solve(prices: number[], n: number): number[] {
  return [...prices].sort((a, b) => a - b).slice(0, n);
}
