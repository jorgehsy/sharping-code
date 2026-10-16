export function solve(total: number, personas: number): number[] {
  const each = Math.ceil(total / personas);
  return [each, each * personas - total];
}
