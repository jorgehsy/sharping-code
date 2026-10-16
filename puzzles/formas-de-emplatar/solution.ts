export function solve(n: number): number {
  let ways = 1;
  for (let i = 2; i <= n; i++) ways *= i;
  return ways;
}
