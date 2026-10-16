export function solve(nums: number[], k: number): boolean {
  const seen = new Set<number>();
  for (const n of nums) {
    if (seen.has(k - n)) return true;
    seen.add(n);
  }
  return false;
}
