export function solve(names: string[], prices: number[]): string | null {
  let best = -1;
  for (let i = 0; i < names.length; i++) {
    if (best === -1 || prices[i] > prices[best]) best = i;
  }
  return best === -1 ? null : names[best];
}
