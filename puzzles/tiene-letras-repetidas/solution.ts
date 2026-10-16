export function solve(s: string): boolean {
  return new Set(s).size !== s.length;
}
