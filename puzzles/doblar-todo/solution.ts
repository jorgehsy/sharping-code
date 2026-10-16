export function solve(nums: number[]): number[] {
  return nums.filter((n) => n !== 0).map((n) => n * 2);
}
