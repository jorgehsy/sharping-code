export function solve(minutos: number[], limite: number): number {
  let total = 0;
  let count = 0;
  for (const m of minutos) {
    total += m;
    if (total > limite) break;
    count++;
  }
  return count;
}
