export function solve(temps: number[]): number {
  let count = 0;
  for (let i = 1; i < temps.length; i++) {
    if (temps[i] > temps[i - 1]) count++;
  }
  return count;
}
