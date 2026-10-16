export function solve(nums: number[]): number {
  return nums.reduce((acc, n, i) => (i % 2 === 0 ? acc + n : acc), 0);
}
