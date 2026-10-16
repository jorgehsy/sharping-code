export function solve(n: number): boolean {
  const s = String(n);
  return s === s.split("").reverse().join("");
}
