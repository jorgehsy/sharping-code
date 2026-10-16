export function solve(n: number): number[] {
  const result: number[] = [];
  for (let d = 1; d <= n; d++) {
    if (n % d === 0) result.push(d);
  }
  return result;
}
