export function solve(moves: number[]): number {
  let balance = 0;
  for (let i = 0; i < moves.length; i++) {
    balance += moves[i];
    if (balance < 0) return i;
  }
  return -1;
}
