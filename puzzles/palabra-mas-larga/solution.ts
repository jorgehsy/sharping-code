export function solve(s: string): string {
  let best = "";
  for (const word of s.split(" ")) {
    if (word.length > best.length) best = word;
  }
  return best;
}
