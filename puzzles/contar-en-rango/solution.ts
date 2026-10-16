export function solve(nums: number[], lo: number, hi: number): number {
  return nums.filter((n) => n >= lo && n <= hi).length;
}
