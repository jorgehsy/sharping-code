export function solve(s: string): boolean {
  const isPal = (i: number, j: number): boolean => {
    while (i < j) if (s[i++] !== s[j--]) return false;
    return true;
  };
  let i = 0;
  let j = s.length - 1;
  while (i < j) {
    if (s[i] !== s[j]) return isPal(i + 1, j) || isPal(i, j - 1);
    i++;
    j--;
  }
  return true;
}
