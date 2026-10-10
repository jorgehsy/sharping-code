import { describe, expect, it } from 'vitest';
import { podium, rankPlayers } from '../src/index.ts';

const p = (playerId: string, score: number, reachedAt: number) => ({ playerId, score, reachedAt });

describe('ranking', () => {
  it('sorts by score desc', () => {
    expect(rankPlayers([p('a', 10, 1), p('b', 30, 2), p('c', 20, 3)]).map((x) => x.playerId)).toEqual(['b', 'c', 'a']);
  });
  it('tie goes to whoever reached the score first', () => {
    expect(rankPlayers([p('a', 10, 5), p('b', 10, 2)]).map((x) => x.playerId)).toEqual(['b', 'a']);
  });
  it('does not mutate input', () => {
    const input = [p('a', 1, 1), p('b', 2, 2)];
    rankPlayers(input);
    expect(input[0]?.playerId).toBe('a');
  });
  it('podium is top 3, fewer if fewer players', () => {
    expect(podium([p('a', 1, 1), p('b', 4, 1), p('c', 3, 1), p('d', 2, 1)])).toEqual(['b', 'c', 'd']);
    expect(podium([p('a', 1, 1)])).toEqual(['a']);
  });
});
