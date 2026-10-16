export function solve(n: number, limite: number): number[] {
  const result: number[] = [];
  for (let m = n; m <= limite; m += n) result.push(m);
  return result;
}
