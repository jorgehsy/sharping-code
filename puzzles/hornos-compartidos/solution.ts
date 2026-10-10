export function solve(dishes: [number, number][]): number[] {
  const order = dishes.map((_, i) => i).sort((a, b) => dishes[a]![0] - dishes[b]![0] || a - b);
  const busyUntil: number[] = []; // per oven
  const out = new Array<number>(dishes.length);
  for (const i of order) {
    const [start, end] = dishes[i]!;
    let oven = busyUntil.findIndex((t) => t <= start);
    if (oven === -1) oven = busyUntil.length;
    busyUntil[oven] = end;
    out[i] = oven;
  }
  return out;
}
