export function solve(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
}
