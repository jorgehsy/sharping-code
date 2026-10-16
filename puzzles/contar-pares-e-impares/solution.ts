export function solve(nums: number[]): number[] {
  const evens = nums.filter((n) => n % 2 === 0).length;
  return [evens, nums.length - evens];
}
