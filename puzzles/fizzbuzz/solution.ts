export function solve(n: number): number[] {
  const result = [0, 0, 0];
  for (let i = 1; i <= n; i++) {
    if (i % 15 === 0) result[2]++;
    else if (i % 3 === 0) result[0]++;
    else if (i % 5 === 0) result[1]++;
  }
  return result;
}
