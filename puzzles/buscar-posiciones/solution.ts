export function solve(nums: number[], x: number): number[] {
  const out: number[] = [];
  nums.forEach((n, i) => {
    if (n === x) out.push(i);
  });
  return out;
}
