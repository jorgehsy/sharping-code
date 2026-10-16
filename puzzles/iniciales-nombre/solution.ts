export function solve(name: string): string {
  return name
    .split(" ")
    .map((w) => `${w[0].toUpperCase()}.`)
    .join("");
}
