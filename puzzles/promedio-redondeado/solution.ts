export function solve(stars: number[]): number {
  const votes = stars.filter((s) => s > 0);
  if (votes.length === 0) return 0;
  return Math.round(votes.reduce((a, b) => a + b, 0) / votes.length);
}
