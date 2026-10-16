export function solve(nums: number[]): number {
  let best = 0;
  let run = 0;
  for (const n of nums) {
    run = n === 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}
