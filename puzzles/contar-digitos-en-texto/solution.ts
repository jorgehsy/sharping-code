export function solve(s: string): number {
  return [...s].filter((c) => c >= "0" && c <= "9").length;
}
