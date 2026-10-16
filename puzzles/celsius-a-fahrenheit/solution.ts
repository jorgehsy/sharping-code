export function solve(temps: number[]): number[] {
  return temps.map((c) => Math.round((c * 9) / 5 + 32));
}
