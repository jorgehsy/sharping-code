export function solve(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const counts = new Map<number, number>();
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
  let best = nums[0];
  for (const [n, c] of counts) {
    const bestCount = counts.get(best)!;
    if (c > bestCount || (c === bestCount && n < best)) best = n;
  }
  return best;
}
