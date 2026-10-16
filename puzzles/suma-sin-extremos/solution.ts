export function solve(nums: number[]): number {
  if (nums.length < 3) return 0;
  const total = nums.reduce((a, b) => a + b, 0);
  return total - Math.max(...nums) - Math.min(...nums);
}
