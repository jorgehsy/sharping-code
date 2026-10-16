export function solve(s: string, n: number): string {
  return [...s].map((c) => c.repeat(n)).join("");
}
