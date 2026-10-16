export function solve(a: string, b: string): boolean {
  const sort = (s: string) => [...s].sort().join("");
  return sort(a) === sort(b);
}
