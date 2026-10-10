export interface PlayerScore {
  playerId: string;
  score: number;
  /** Epoch ms when the player reached their current score. */
  reachedAt: number;
}

/** Score desc; on ties, whoever reached that score first. Does not mutate the input. */
export const rankPlayers = (players: readonly PlayerScore[]): PlayerScore[] =>
  [...players].sort((a, b) => b.score - a.score || a.reachedAt - b.reachedAt);

/** Player ids of the top 3 (fewer if fewer players). */
export const podium = (players: readonly PlayerScore[]): string[] =>
  rankPlayers(players)
    .slice(0, 3)
    .map((p) => p.playerId);
