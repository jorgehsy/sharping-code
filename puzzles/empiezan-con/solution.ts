export function solve(words: string[], c: string): number {
  return words.filter((w) => w[0].toLowerCase() === c.toLowerCase()).length;
}
