export function solve(n: number, k: number): number {
  let sum = 0;
  for (let i = 1; i <= n; i++) {
    if (i % k !== 0) sum += i;
  }
  return sum;
}
