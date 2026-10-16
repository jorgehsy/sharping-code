export function solve(stock: number[], min: number): number[] {
  return stock.flatMap((s, i) => (s < min ? [i] : []));
}
