export function solve(nums: number[]): boolean {
  return nums.every((n, i) => i === 0 || nums[i - 1] <= n);
}
