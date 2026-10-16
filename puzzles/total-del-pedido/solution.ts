export function solve(prices: number[], qty: number[]): number {
  return prices.reduce((sum, p, i) => sum + p * (qty[i] - Math.floor(qty[i] / 3)), 0);
}
