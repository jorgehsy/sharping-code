export function solve(desde: number, hasta: number): number {
  let count = 0;
  for (let y = desde; y <= hasta; y++) {
    if ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) count++;
  }
  return count;
}
