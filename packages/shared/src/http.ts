import type { Difficulty, PuzzleCase } from './puzzle.ts';
import type { RunnerResult, SabotageRule } from './runner.ts';

/** HTTP contract between the SPA and the lambdalith. See docs/api.md. All times are epoch ms. */

export type GameStatus = 'lobby' | 'running' | 'finished';

/** Header carrying the player token on every authenticated route. */
export const PLAYER_TOKEN_HEADER = 'x-player-token';

export interface NicknameRequest {
  nickname: string;
}

/** `POST /games` → 201. */
export interface CreateGameResponse {
  code: string;
  playerId: string;
  playerToken: string;
}

/** `POST /games/{code}/players` → 201. */
export interface JoinGameResponse {
  playerId: string;
  playerToken: string;
}

export interface PlayerSummary {
  playerId: string;
  nickname: string;
  score: number;
}

/** An open order as everyone sees it (no statement, no cases). */
export interface OrderSummary {
  orderId: string;
  title: string;
  difficulty: Difficulty;
  basePoints: number;
  openedAt: number;
  expiresAt: number;
  /** Correct deliveries so far (0..3). */
  deliveries: number;
}

export interface MyState {
  playerId: string;
  nickname: string;
  score: number;
  currentOrderId: string | null;
  condiments: number;
  sabotage: SabotageRule | null;
}

/** `GET /games/{code}` → 200. */
export interface GameSnapshot {
  code: string;
  status: GameStatus;
  hostPlayerId: string;
  createdAt: number;
  startedAt: number | null;
  rushAt: number | null;
  endsAt: number | null;
  /** Server time, so clients can correct clock skew. */
  now: number;
  /** Last event seq published for this game (META.seq). Events with seq <= this are already reflected. */
  seq: number;
  players: PlayerSummary[];
  /** Open orders only. */
  orders: OrderSummary[];
  me: MyState | undefined;
}

/** `POST /games/{code}/orders/{id}/take` → 200. The full order to cook. */
export interface TakeOrderResponse extends OrderSummary {
  /** Markdown statement (body of puzzle.md). */
  statement: string;
  /** E.g. "function solve(nums: number[]): number". */
  signature: string;
  publicCases: PuzzleCase[];
}

export interface SubmitRequest {
  source: string;
}

/** `POST /games/{code}/orders/{id}/submit` → 200. Failing is a 200 too (it's a game outcome, not an error). */
export type SubmitResponse =
  | { passed: true; rank: number; points: number; scores: Record<string, number> }
  | (Extract<RunnerResult, { passed: false }> & { penalty: number; scores: Record<string, number> });

export interface SabotageRequest {
  targetPlayerId: string;
}

/** Error body for 4xx/5xx. */
export interface ApiError {
  message: string;
}
