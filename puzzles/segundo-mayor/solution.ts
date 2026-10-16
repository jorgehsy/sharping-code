export function solve(nums: number[]): number | null {
  const distinct = [...new Set(nums)].sort((a, b) => b - a);
  return distinct.length < 2 ? null : distinct[1];
}
