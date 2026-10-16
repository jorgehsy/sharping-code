export function solve(trays: number[][]): number {
  let best = -1;
  let bestSum = 0;
  trays.forEach((tray, i) => {
    const sum = tray.reduce((a, b) => a + b, 0);
    if (best === -1 || sum > bestSum) {
      best = i;
      bestSum = sum;
    }
  });
  return best;
}
