export function solve(s: string): boolean {
  const t = s.replaceAll(" ", "").toLowerCase();
  return t === [...t].reverse().join("");
}
