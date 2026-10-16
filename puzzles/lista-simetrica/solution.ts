export function solve(nums: number[]): boolean {
  return nums.every((n, i) => n === nums[nums.length - 1 - i]);
}
