export function solve(s: string): boolean {
  return s.length > 0 && [...s].every((c) => c >= "0" && c <= "9");
}
