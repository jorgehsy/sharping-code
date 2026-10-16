import type { GameState } from '../store/state.ts';

export type Cue =
  | 'playerJoined'
  | 'gameStarted'
  | 'gameFinished'
  | 'orderOpened'
  | 'myDelivery'
  | 'penalty'
  | 'sabotaged'
  | 'condiment'
  | 'hurry';

/** Warn when my current order has this little time left. */
export const HURRY_MS = 30_000;

/**
 * Sounds to play for one store transition. Pure: compares two states, no clock.
 * The first load of a game (snapshot) is silent, so joining mid-game doesn't burst.
 */
export function cuesFor(prev: GameState, next: GameState): Cue[] {
  if (prev.hostPlayerId === null || prev.code !== next.code) return [];
  const out = new Set<Cue>();
  const me = next.playerId;

  if (prev.status === 'lobby' && next.status === 'lobby' && next.players.length > prev.players.length) out.add('playerJoined');
  if (prev.status === 'lobby' && next.status === 'running') out.add('gameStarted');
  if (prev.status === 'running' && next.status === 'finished') out.add('gameFinished');

  if (next.status === 'running') {
    const known = new Set(prev.orders.map((o) => o.orderId));
    if (next.orders.some((o) => !known.has(o.orderId))) out.add('orderOpened');

    for (const o of next.orders) {
      const before = prev.orders.find((p) => p.orderId === o.orderId)?.deliveredBy ?? [];
      // Only my own deliveries chime: other players deliver all the time and it was distracting.
      if (me && o.deliveredBy.includes(me) && !before.includes(me)) out.add('myDelivery');
    }

    const myOrder = prev.me?.currentOrderId;
    const expired = myOrder && !next.orders.some((o) => o.orderId === myOrder);
    const burned = !out.has('myDelivery') && prev.me && next.me && next.me.score < prev.me.score;
    if (expired || burned) out.add('penalty');

    if (!prev.me?.sabotage && next.me?.sabotage) out.add('sabotaged');
    if (prev.me && next.me && next.me.condiments > prev.me.condiments) out.add('condiment');
  }
  return [...out];
}

/** The order to warn about now, or null. `warned` holds orders already warned (once each). */
export function hurryOrder(s: GameState, serverNowMs: number, warned: ReadonlySet<string>): string | null {
  if (s.status !== 'running') return null;
  const id = s.me?.currentOrderId;
  if (!id || warned.has(id)) return null;
  const order = s.orders.find((o) => o.orderId === id);
  if (!order) return null;
  const left = order.expiresAt - serverNowMs;
  return left > 0 && left <= HURRY_MS ? id : null;
}

/** Background music plays in the lobby and during the game (not on home or the final screen). */
export const wantsMusic = (s: GameState) => s.code !== null && s.hostPlayerId !== null && (s.status === 'lobby' || s.status === 'running');
