export function solve(s: string): string {
  return [...s].map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase())).join("");
}
