export function solve(nums: number[]): number[] {
  return [...nums].sort((a, b) => a - b);
}
