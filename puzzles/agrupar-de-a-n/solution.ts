export function solve(nums: number[], n: number): number[][] {
  const groups: number[][] = [];
  for (let i = 0; i < nums.length; i += n) {
    groups.push(nums.slice(i, i + n));
  }
  return groups;
}
