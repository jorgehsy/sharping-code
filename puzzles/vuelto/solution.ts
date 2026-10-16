export function solve(pago: number, total: number): number[] {
  let change = pago - total;
  return [50, 20, 10, 5, 1].map((coin) => {
    const count = Math.floor(change / coin);
    change -= count * coin;
    return count;
  });
}
