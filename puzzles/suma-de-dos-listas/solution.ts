export function solve(a: number[], b: number[]): number[] {
  const len = Math.max(a.length, b.length);
  return Array.from({ length: len }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0));
}
