export function solve(nums: number[]): number[] {
  if (nums.length === 0) return [];
  return [nums[0], nums[nums.length - 1]];
}
