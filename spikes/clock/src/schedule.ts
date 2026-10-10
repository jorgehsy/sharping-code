// Pure, deterministic-given-inputs scheduling logic. No Date.now / Math.random in here:
// callers pass `now` and `random` (the handler does that inside a durable step).

export type GameEventType =
  | 'game.started'
  | 'order.opened'
  | 'order.expired'
  | 'rush.started'
  | 'game.finished';

export interface PlannedEvent {
  type: GameEventType;
  seq: number;
  plannedAt: number; // epoch ms
  data: Record<string, unknown>;
}

export interface Schedule {
  gameCode: string;
  t0: number;
  durationSec: number;
  events: PlannedEvent[];
}

export interface BuildScheduleInput {
  gameCode: string;
  durationSec: number;
  now: number;
  random: () => number;
  orderCount?: number; // default 3 => 3 opened + 3 expired = 6 order events
}

const PRIORITY: Record<GameEventType, number> = {
  'game.started': 0,
  'order.opened': 1,
  'order.expired': 2,
  'rush.started': 3,
  'game.finished': 4,
};

export function buildSchedule(input: BuildScheduleInput): Schedule {
  const { gameCode, durationSec, now: t0, random } = input;
  const orderCount = input.orderCount ?? 3;
  const d = durationSec * 1000;
  const rushOffset = durationSec > 90 ? d - 60_000 : Math.round(d * 0.7);
  const end = t0 + d;
  const rushAt = t0 + rushOffset;

  const raw: Omit<PlannedEvent, 'seq'>[] = [
    { type: 'game.started', plannedAt: t0, data: { startedAt: t0, rushAt, endsAt: end } },
  ];

  for (let i = 0; i < orderCount; i++) {
    const open = Math.round(d * (0.05 + random() * 0.5));
    const ttl = Math.round(d * (0.1 + random() * 0.2));
    const expire = Math.min(open + ttl, Math.round(d * 0.95));
    const orderId = `o${i + 1}`;
    raw.push({
      type: 'order.opened',
      plannedAt: t0 + open,
      data: {
        orderId,
        title: `Order ${i + 1}`,
        difficulty: 1 + Math.floor(random() * 3),
        basePoints: 100,
        expiresAt: t0 + expire,
      },
    });
    raw.push({ type: 'order.expired', plannedAt: t0 + expire, data: { orderId } });
  }

  raw.push({ type: 'rush.started', plannedAt: rushAt, data: {} });
  raw.push({ type: 'game.finished', plannedAt: end, data: {} });

  raw.sort((a, b) => a.plannedAt - b.plannedAt || PRIORITY[a.type] - PRIORITY[b.type]);
  return {
    gameCode,
    t0,
    durationSec,
    events: raw.map((e, i) => ({ ...e, seq: i + 1 })),
  };
}

/**
 * Seconds to durably wait so we wake up slightly BEFORE the target (wait granularity is whole
 * seconds and resume has latency). The remainder (< marginMs + 1s) is slept inside the publish step.
 * Returns 0 when no wait is worthwhile (already late or within the margin).
 */
export function planWaitSeconds(remainingMs: number, marginMs: number): number {
  const w = Math.floor((remainingMs - marginMs) / 1000);
  return w > 0 ? w : 0;
}

export interface PublishedEvent {
  type: GameEventType;
  seq: number;
  at: number;
  plannedAt: number;
  data: Record<string, unknown>;
}

export function toPublished(e: PlannedEvent, at: number): PublishedEvent {
  return { type: e.type, seq: e.seq, at, plannedAt: e.plannedAt, data: e.data };
}
