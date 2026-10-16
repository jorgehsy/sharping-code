export function solve(nums: number[]): number[] {
  let total = 0;
  return nums.map((n) => (total += n));
}
