import type {
  EventPayloads,
  EventType,
  GameEvent,
  GameSnapshot,
  OrderSummary,
  Scores,
  SubmitResponse,
  TakeOrderResponse,
} from '@sharping/shared';
import { BASE_POINTS, CATALOG, CLOCK_MS, type FakePuzzle } from './catalog.ts';

/** Event as produced by the fake server; the realtime decorator stamps `seq`. */
export type DraftEvent = { [T in EventType]: { type: T; at: number; data: EventPayloads[T] } }[EventType];

export interface MockOptions {
  now?: () => number;
  /** Runs emitted events "after the HTTP response", like the real server. Tests pass a sync runner. */
  defer?: (fn: () => void) => void;
  /** How many orders stay open at once. */
  openTarget?: number;
}

const SHARES = [1, 0.6, 0.3];
const PENALTY = 10;
const CONDIMENT_RULE = 'no-loops';

interface FakeOrder {
  summary: OrderSummary;
  puzzle: FakePuzzle;
}

/**
 * Fake backend for orders: seeds/rotates orders and answers take/submit/sabotage, emitting the same
 * events the real server will. Disposable: delete src/mock/ once the backend implements these routes.
 */
export class MockOrders {
  private readonly now: () => number;
  private readonly defer: (fn: () => void) => void;
  private readonly openTarget: number;
  private listeners = new Set<(e: DraftEvent) => void>();
  private open: FakeOrder[] = [];
  private scores: Scores = {};
  private me: string | null = null;
  private condiments = 0;
  private sabotaged = false;
  private timing: { startedAt: number; rushAt: number; endsAt: number } | null = null;
  private rushSent = false;
  private finished = false;
  private nextId = 1;
  private cursor = 0;

  constructor(opts: MockOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.defer = opts.defer ?? ((fn) => void setTimeout(fn, 0));
    this.openTarget = opts.openTarget ?? 4;
  }

  onEvent(fn: (e: DraftEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit<T extends EventType>(type: T, data: EventPayloads[T]) {
    const e = { type, at: this.now(), data } as DraftEvent;
    this.defer(() => this.listeners.forEach((l) => l(e)));
  }

  /** Idempotent: first call (game running) seeds orders and starts the rotation clock. */
  ensureRunning(timing: { startedAt: number; rushAt: number; endsAt: number }) {
    if (this.timing) return;
    this.timing = timing;
    while (this.open.length < this.openTarget) this.openOne();
  }

  /** Called with every snapshot so scores/me stay in sync with the real players. */
  observe(snap: Pick<GameSnapshot, 'players' | 'me'>) {
    for (const p of snap.players) this.scores[p.playerId] ??= p.score;
    if (snap.me) {
      this.me = snap.me.playerId;
      this.condiments = Math.max(this.condiments, snap.me.condiments);
    }
  }

  orders(): OrderSummary[] {
    return this.open.map((o) => ({ ...o.summary }));
  }

  private openOne() {
    const have = new Set(this.open.map((o) => o.puzzle.title));
    let puzzle: FakePuzzle | undefined;
    for (let i = 0; i < CATALOG.length && !puzzle; i++) {
      const c = CATALOG[this.cursor++ % CATALOG.length]!;
      if (!have.has(c.title)) puzzle = c;
    }
    puzzle ??= CATALOG[0]!;
    const at = this.now();
    const summary: OrderSummary = {
      orderId: `mock-${this.nextId++}`,
      title: puzzle.title,
      difficulty: puzzle.difficulty,
      basePoints: BASE_POINTS[puzzle.difficulty],
      openedAt: at,
      expiresAt: Math.min(at + CLOCK_MS[puzzle.difficulty], this.timing?.endsAt ?? Infinity),
      deliveries: 0,
    };
    this.open.push({ summary, puzzle });
    this.emit('order.opened', {
      orderId: summary.orderId,
      title: summary.title,
      difficulty: summary.difficulty,
      basePoints: summary.basePoints,
      expiresAt: summary.expiresAt,
    });
  }

  /** Drives time-based events: order expiry + replacement, rush, end. Call from a timer. */
  advance() {
    if (!this.timing || this.finished) return;
    const t = this.now();
    for (const o of this.open.filter((x) => x.summary.expiresAt <= t)) {
      this.open = this.open.filter((x) => x !== o);
      this.emit('order.expired', { orderId: o.summary.orderId });
    }
    if (!this.rushSent && t >= this.timing.rushAt) {
      this.rushSent = true;
      this.emit('rush.started', {});
    }
    if (t >= this.timing.endsAt) {
      this.finished = true;
      const podium = Object.entries(this.scores).sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 3);
      this.emit('game.finished', { podium, awards: podium[0] ? { 'Most fake points': podium[0] } : {}, scores: { ...this.scores } });
      return;
    }
    while (this.open.length < this.openTarget) this.openOne();
  }

  private find(orderId: string): FakeOrder {
    const o = this.open.find((x) => x.summary.orderId === orderId);
    if (!o) throw Object.assign(new Error('Order is closed'), { status: 409 });
    return o;
  }

  take(orderId: string): TakeOrderResponse {
    const o = this.find(orderId);
    if (this.me) this.emit('order.taken', { orderId, playerId: this.me });
    return { ...o.summary, statement: o.puzzle.statement, signature: o.puzzle.signature, publicCases: o.puzzle.publicCases };
  }

  /** Passes iff the source contains "return"; otherwise fails the first public case. */
  submit(orderId: string, source: string): SubmitResponse {
    const o = this.find(orderId);
    const me = this.me ?? 'me';
    if (!/\breturn\b/.test(source)) {
      this.scores[me] = (this.scores[me] ?? 0) - PENALTY;
      const scores = { ...this.scores };
      this.emit('dish.burned', { playerId: me, orderId, penalty: PENALTY, scores });
      const c = o.puzzle.publicCases[0]!;
      return { passed: false, reason: 'wrong', case: { input: c.input, expected: c.output, actual: undefined }, durationMs: 1, penalty: PENALTY, scores };
    }
    const rank = o.summary.deliveries + 1;
    const points = Math.round(o.summary.basePoints * (SHARES[rank - 1] ?? 0.3) * (this.rush() ? 2 : 1));
    o.summary.deliveries = rank;
    this.scores[me] = (this.scores[me] ?? 0) + points;
    const scores = { ...this.scores };
    this.emit('order.delivered', { orderId, playerId: me, rank, points, scores });
    if (this.sabotaged) {
      this.sabotaged = false;
      this.emit('sabotage.cleared', { playerId: me });
    }
    if (o.puzzle.difficulty === 'hard' && rank === 1) {
      this.condiments = Math.min(2, this.condiments + 1);
      this.emit('condiment.earned', { playerId: me });
    }
    return { passed: true, rank, points, scores };
  }

  sabotage(targetPlayerId: string) {
    if (this.condiments < 1) throw Object.assign(new Error('No condiments'), { status: 409 });
    this.condiments--;
    this.emit('sabotage.applied', { fromPlayerId: this.me ?? 'me', toPlayerId: targetPlayerId, rule: CONDIMENT_RULE });
  }

  private rush() {
    return this.timing !== null && this.now() >= this.timing.rushAt;
  }
}

export type { GameEvent };
