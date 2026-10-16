export function solve(nums: number[]): boolean {
  return nums.every((n) => n === nums[0]);
}
