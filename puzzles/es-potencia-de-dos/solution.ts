export function solve(n: number): boolean {
  while (n % 2 === 0) n /= 2;
  return n === 1;
}
