export function solve(temps: number[]): number[] {
  const result = [0, 0, 0];
  for (const t of temps) {
    if (t < 50) result[0]++;
    else if (t <= 69) result[1]++;
    else result[2]++;
  }
  return result;
}
