export function solve(pedidos: string[], n: number): string[] {
  return pedidos.slice(Math.max(0, pedidos.length - n)).reverse();
}
