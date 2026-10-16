export function solve(nums: number[], n: number): number[] {
  const seen = new Set(nums);
  const missing: number[] = [];
  for (let i = 1; i <= n; i++) {
    if (!seen.has(i)) missing.push(i);
  }
  return missing;
}
