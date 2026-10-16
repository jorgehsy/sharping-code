export function solve(nums: number[]): number {
  if (nums.length === 0) return 0;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return nums.filter((n) => n > avg).length;
}
