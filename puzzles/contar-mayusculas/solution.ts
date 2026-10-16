export function solve(s: string): number {
  return [...s].filter((c) => c >= "A" && c <= "Z").length;
}
