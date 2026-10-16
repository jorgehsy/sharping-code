export function solve(receta: string[], despensa: string[]): string[] {
  const have = new Set(despensa);
  return receta.filter((item) => !have.has(item));
}
