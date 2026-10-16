export function solve(s: string): string {
  return s
    .split(" ")
    .filter((w) => w !== "")
    .map((w) => w[0].toUpperCase())
    .join("");
}
