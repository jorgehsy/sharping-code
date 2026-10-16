export function solve(s: string): string {
  return [...s].map((c) => ("aeiouAEIOU".includes(c) ? "*" : c)).join("");
}
