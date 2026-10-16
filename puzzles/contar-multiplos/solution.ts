export function solve(n: number, k: number): number {
  let count = 0;
  for (let i = 1; i <= n; i++) {
    if (i % k === 0) count++;
  }
  return count;
}
