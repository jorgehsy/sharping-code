export function solve(s: string): string {
  return s.split(" ").map((w) => [...w].reverse().join("")).join(" ");
}
