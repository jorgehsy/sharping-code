export function solve(pedidos: string[]): string | null {
  const counts = new Map<string, number>();
  for (const p of pedidos) counts.set(p, (counts.get(p) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [plato, count] of counts) {
    if (count > bestCount) {
      best = plato;
      bestCount = count;
    }
  }
  return best;
}
