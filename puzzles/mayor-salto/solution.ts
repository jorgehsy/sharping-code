export function solve(nums: number[]): number {
  let best = 0;
  for (let i = 1; i < nums.length; i++) {
    best = Math.max(best, Math.abs(nums[i] - nums[i - 1]));
  }
  return best;
}
