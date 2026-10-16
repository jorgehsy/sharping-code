export function solve(a: number[], b: number[]): number[] {
  const inB = new Set(b);
  return [...new Set(a)].filter((x) => inB.has(x));
}
