export function solve(nums: number[]): number[] {
  if (nums.length === 0) return [];
  return [nums[nums.length - 1], ...nums.slice(0, -1)];
}
