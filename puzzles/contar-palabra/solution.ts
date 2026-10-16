export function solve(words: string[], w: string): number {
  return words.filter((x) => x.toLowerCase() === w.toLowerCase()).length;
}
