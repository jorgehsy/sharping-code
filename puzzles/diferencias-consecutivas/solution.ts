export function solve(nums: number[]): number[] {
  return nums.slice(1).map((n, i) => n - nums[i]);
}
