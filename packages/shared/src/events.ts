/** Events on AppSync Events channel `/game/{code}`. See docs/api.md. */
export interface EventPayloads {
  'player.joined': { playerId: string; nickname: string };
  'game.started': { startedAt: number; rushAt: number; endsAt: number };
  'order.opened': { orderId: string; title: string; difficulty: string; basePoints: number; expiresAt: number };
  'order.taken': { orderId: string; playerId: string };
  'order.delivered': { orderId: string; playerId: string; rank: number; points: number; scores: Scores };
  'dish.burned': { playerId: string; orderId: string; penalty: number; scores: Scores };
  'order.expired': { orderId: string };
  'condiment.earned': { playerId: string };
  'sabotage.applied': { fromPlayerId: string; toPlayerId: string; rule: string };
  'sabotage.cleared': { playerId: string };
  'rush.started': Record<string, never>;
  /** `awards`: award id → playerId. */
  'game.finished': { podium: string[]; awards: Record<string, string>; scores: Scores };
}

export type EventType = keyof EventPayloads;
export type Scores = Record<string, number>;

/** Common envelope. `seq` is per-game and gapless; a gap means the client must refetch the snapshot. */
export interface GameEvent<T extends EventType = EventType> {
  type: T;
  seq: number;
  at: number;
  data: EventPayloads[T];
}

export const gameChannel = (code: string) => `/game/${code}`;
