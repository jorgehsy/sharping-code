export function solve(nums: number[]): number {
  if (nums.length === 0) return -1;
  return nums.indexOf(Math.max(...nums));
}
