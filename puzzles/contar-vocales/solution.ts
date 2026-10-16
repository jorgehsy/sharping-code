export function solve(s: string): number {
  return [...s].filter((c) => "aeiouAEIOU".includes(c)).length;
}
