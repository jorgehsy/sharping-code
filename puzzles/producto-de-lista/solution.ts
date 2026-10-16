export function solve(nums: number[]): number {
  return nums.reduce((a, b) => a * b, 1);
}
