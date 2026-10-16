export function solve(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.max(...nums) - Math.min(...nums);
}
