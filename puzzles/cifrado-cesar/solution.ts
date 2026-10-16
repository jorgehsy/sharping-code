export function solve(s: string, k: number): string {
  return [...s]
    .map((c) => {
      if (c < "a" || c > "z") return c;
      return String.fromCharCode(((c.charCodeAt(0) - 97 + k) % 26) + 97);
    })
    .join("");
}
