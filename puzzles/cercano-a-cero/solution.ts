export function solve(nums: number[]): number | null {
  let best: number | null = null;
  for (const n of nums) {
    if (best === null) {
      best = n;
      continue;
    }
    const d = Math.abs(n);
    const bd = Math.abs(best);
    if (d < bd || (d === bd && n > best)) best = n;
  }
  return best;
}
