import type {
  GameEvent,
  GameStatus,
  MyState,
  OrderSummary,
  PlayerSummary,
  SubmitResponse,
  TakeOrderResponse,
} from '@sharping/shared';
import type { ConnectionStatus } from '../realtime/client.ts';

export interface Toast {
  id: string;
  kind: 'info' | 'good' | 'bad';
  text: string;
  at: number;
}

export interface GameState {
  /** Identity of the joined game; null on the Home screen. */
  code: string | null;
  playerId: string | null;
  /** True once a snapshot has been applied (and no gap since). Events are only applied while synced. */
  synced: boolean;
  /** Events received while not synced, waiting for the snapshot. Sorted by seq on replay. */
  buffer: GameEvent[];
  /** Last applied event seq (starts at snapshot.seq); null before the first snapshot. */
  lastSeq: number | null;
  /** serverNow = Date.now() + clockOffset. */
  clockOffset: number;
  connection: ConnectionStatus;

  status: GameStatus;
  hostPlayerId: string | null;
  startedAt: number | null;
  rushAt: number | null;
  endsAt: number | null;
  /** Set by `rush.started` or by a snapshot taken after rushAt. */
  rush: boolean;

  players: PlayerSummary[];
  orders: OrderSummary[];
  me: MyState | null;

  /** Full details of the order I'm cooking (from the take response). */
  taken: TakeOrderResponse | null;
  submitting: boolean;
  lastSubmit: { orderId: string; result: SubmitResponse } | null;
  /** Last action error (take/submit/sabotage/start), shown in the UI. */
  actionError: string | null;

  toasts: Toast[];
  podium: string[];
  awards: Record<string, string>;
}

export const initialState = (): GameState => ({
  code: null,
  playerId: null,
  synced: false,
  buffer: [],
  lastSeq: null,
  clockOffset: 0,
  connection: 'connecting',
  status: 'lobby',
  hostPlayerId: null,
  startedAt: null,
  rushAt: null,
  endsAt: null,
  rush: false,
  players: [],
  orders: [],
  me: null,
  taken: null,
  submitting: false,
  lastSubmit: null,
  actionError: null,
  toasts: [],
  podium: [],
  awards: {},
});
