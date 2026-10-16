import type {
  EventPayloads,
  EventType,
  GameEvent,
  GameSnapshot,
  MyState,
  OrderSummary,
  PlayerSummary,
  SabotageRule,
  Scores,
  SubmitResponse,
  TasteResponse,
  TakeOrderResponse,
} from '@sharping/shared';
import { BASE_POINTS, CATALOG, CLOCK_MS, type FakePuzzle } from './catalog.ts';
import { MAX_CONDIMENTS, SOLVES_PER_CONDIMENT } from '../store/reducer.ts';

/** Event as produced by the fake server; the realtime decorator stamps `seq`. */
export type DraftEvent = { [T in EventType]: { type: T; at: number; data: EventPayloads[T] } }[EventType];

export interface MockOptions {
  now?: () => number;
  /** Runs emitted events "after the HTTP response", like the real server. Tests pass a sync runner. */
  defer?: (fn: () => void) => void;
  /** How many orders stay open at once (orders that already have 3 deliveries don't count). */
  openTarget?: number;
  /** Fake players that join when the game runs, take orders and deliver them (default 0). */
  bots?: number;
  /** Randomness source (tests pass a deterministic one). */
  random?: () => number;
}

const SHARES = [1, 0.6, 0.3];
const PENALTY = 10;
const CONDIMENT_RULE: SabotageRule = 'no-loops';
const BOT_NAMES = ['Bruno', 'Caro', 'Diego', 'Eli', 'Fede', 'Gabi', 'Hugo', 'Iris', 'Jana'];
/** How long a bot cooks before delivering, and how long it idles between orders. */
const BOT_COOK_MS: [number, number] = [12_000, 40_000];
const BOT_IDLE_MS: [number, number] = [2_000, 8_000];
const BOT_BURN_CHANCE = 0.12;

interface Bot {
  playerId: string;
  nickname: string;
  orderId: string | null;
  /** Next time the bot acts: pick an order when idle, deliver (or burn) when cooking. */
  actAt: number;
  sabotage: SabotageRule | null;
}

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
  private readonly botCount: number;
  private readonly random: () => number;
  private bots: Bot[] = [];
  private me: string | null = null;
  private myOrder: string | null = null;
  private condiments = 0;
  private solved = 0;
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
    this.botCount = Math.min(opts.bots ?? 0, BOT_NAMES.length);
    this.random = opts.random ?? Math.random;
  }

  private between([lo, hi]: [number, number]) {
    return lo + this.random() * (hi - lo);
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
    while (this.openCount() < this.openTarget) this.openOne();
    for (let i = 0; i < this.botCount; i++) {
      const bot: Bot = { playerId: `bot-${i + 1}`, nickname: BOT_NAMES[i]!, orderId: null, actAt: this.now() + this.between(BOT_IDLE_MS), sabotage: null };
      this.bots.push(bot);
      this.scores[bot.playerId] = 0;
      this.emit('player.joined', { playerId: bot.playerId, nickname: bot.nickname });
    }
  }

  private openCount() {
    return this.open.filter((o) => o.summary.deliveredBy.length < 3).length;
  }

  /** Called with every snapshot so scores/me stay in sync with the real players. */
  observe(snap: Pick<GameSnapshot, 'players' | 'me'>) {
    for (const p of snap.players) this.scores[p.playerId] ??= p.score;
    if (snap.me) {
      this.me = snap.me.playerId;
      this.condiments = Math.max(this.condiments, snap.me.condiments);
      this.solved = Math.max(this.solved, snap.me.solved);
    }
  }

  orders(): OrderSummary[] {
    return this.open.map((o) => ({ ...o.summary, deliveredBy: [...o.summary.deliveredBy] }));
  }

  /** The real snapshot's players/me with the mock's view on top (bots, who cooks what, scores, curses). */
  decorate(snap: Pick<GameSnapshot, 'players' | 'me'>): { players: PlayerSummary[]; me: MyState | undefined } {
    const mine = this.myOrder && this.open.some((o) => o.summary.orderId === this.myOrder) ? this.myOrder : null;
    const players: PlayerSummary[] = snap.players.map((p) => ({
      ...p,
      score: this.scores[p.playerId] ?? p.score,
      currentOrderId: p.playerId === this.me ? mine : (p.currentOrderId ?? null),
      sabotage: p.playerId === this.me ? (this.sabotaged ? CONDIMENT_RULE : null) : (p.sabotage ?? null),
    }));
    for (const b of this.bots) {
      if (!players.some((p) => p.playerId === b.playerId)) {
        players.push({ playerId: b.playerId, nickname: b.nickname, score: this.scores[b.playerId] ?? 0, currentOrderId: b.orderId, sabotage: b.sabotage });
      }
    }
    const me = snap.me && {
      ...snap.me,
      score: this.scores[snap.me.playerId] ?? snap.me.score,
      currentOrderId: mine,
      condiments: this.condiments,
      solved: this.solved,
      sabotage: this.sabotaged ? CONDIMENT_RULE : null,
    };
    return { players, me };
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
      deliveredBy: [],
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
      for (const b of this.bots) if (b.orderId === o.summary.orderId) b.orderId = null;
      if (this.myOrder === o.summary.orderId) this.myOrder = null;
      this.emit('order.expired', { orderId: o.summary.orderId });
    }
    if (!this.rushSent && t >= this.timing.rushAt) {
      this.rushSent = true;
      this.emit('rush.started', {});
    }
    if (t >= this.timing.endsAt) {
      this.finished = true;
      const podium = Object.entries(this.scores).sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 3);
      this.emit('game.finished', { podium, awards: podium[0] ? { 'Más puntos falsos': podium[0] } : {}, scores: { ...this.scores } });
      return;
    }
    this.actBots(t);
    while (this.openCount() < this.openTarget) this.openOne();
  }

  /** Bots: pick an open order, cook for a while, then deliver (or burn it once in a while). */
  private actBots(t: number) {
    for (const b of this.bots) {
      if (t < b.actAt) continue;
      const cooking = b.orderId ? this.open.find((o) => o.summary.orderId === b.orderId) : undefined;
      if (!cooking) {
        b.orderId = null;
        const options = this.open.filter((o) => o.summary.deliveredBy.length < 3 && !o.summary.deliveredBy.includes(b.playerId));
        const pick = options[Math.floor(this.random() * options.length)];
        if (!pick) {
          b.actAt = t + this.between(BOT_IDLE_MS);
          continue;
        }
        b.orderId = pick.summary.orderId;
        b.actAt = t + this.between(BOT_COOK_MS);
        this.emit('order.taken', { orderId: pick.summary.orderId, playerId: b.playerId });
        continue;
      }
      const sum = cooking.summary;
      if (sum.deliveredBy.length >= 3 || sum.deliveredBy.includes(b.playerId)) {
        b.orderId = null; // beaten to it: look for another one
        b.actAt = t + this.between(BOT_IDLE_MS);
        continue;
      }
      if (this.random() < BOT_BURN_CHANCE) {
        this.scores[b.playerId] = (this.scores[b.playerId] ?? 0) - PENALTY;
        this.emit('dish.burned', { playerId: b.playerId, orderId: sum.orderId, penalty: PENALTY, scores: { ...this.scores } });
        b.actAt = t + this.between(BOT_COOK_MS);
        continue;
      }
      this.deliver(cooking, b.playerId);
      b.orderId = null;
      b.actAt = t + this.between(BOT_IDLE_MS);
      if (b.sabotage) {
        b.sabotage = null;
        this.emit('sabotage.cleared', { playerId: b.playerId });
      }
      // The first bot to deliver a hard order sometimes curses me.
      if (cooking.puzzle.difficulty === 'hard' && sum.deliveredBy[0] === b.playerId && this.me && !this.sabotaged && this.random() < 0.5) {
        this.sabotaged = true;
        this.emit('sabotage.applied', { fromPlayerId: b.playerId, toPlayerId: this.me, rule: CONDIMENT_RULE });
      }
    }
  }

  /** Registers a correct delivery by `playerId` and emits `order.delivered` with the full score table. */
  private deliver(o: FakeOrder, playerId: string) {
    const rank = o.summary.deliveredBy.length + 1;
    const points = Math.round(o.summary.basePoints * (SHARES[rank - 1] ?? 0.3) * (this.rush() ? 2 : 1));
    o.summary.deliveredBy.push(playerId);
    o.summary.deliveries = rank;
    this.scores[playerId] = (this.scores[playerId] ?? 0) + points;
    this.emit('order.delivered', { orderId: o.summary.orderId, playerId, rank, points, scores: { ...this.scores } });
    return { rank, points };
  }

  private find(orderId: string): FakeOrder {
    const o = this.open.find((x) => x.summary.orderId === orderId);
    if (!o) throw Object.assign(new Error('La comanda está cerrada'), { status: 409 });
    return o;
  }

  take(orderId: string): TakeOrderResponse {
    const o = this.find(orderId);
    this.myOrder = orderId;
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
    if (o.summary.deliveredBy.includes(me)) throw Object.assign(new Error('Ya entregaste'), { status: 409 });
    if (o.summary.deliveredBy.length >= 3) throw Object.assign(new Error('La comanda está llena'), { status: 409 });
    const { rank, points } = this.deliver(o, me);
    if (this.myOrder === orderId) this.myOrder = null;
    const scores = { ...this.scores };
    if (this.sabotaged) {
      this.sabotaged = false;
      this.emit('sabotage.cleared', { playerId: me });
    }
    this.solved++;
    const earned = (o.puzzle.difficulty === 'hard' && rank === 1 ? 1 : 0) + (this.solved % SOLVES_PER_CONDIMENT === 0 ? 1 : 0);
    for (let i = 0; i < earned && this.condiments < MAX_CONDIMENTS; i++) {
      this.condiments++;
      this.emit('condiment.earned', { playerId: me });
    }
    return { passed: true, rank, points, solved: this.solved, scores };
  }

  /** Free run: no events, no scores. Without "return" every case fails with an error; with it, all but the last pass. */
  taste(orderId: string, source: string): TasteResponse {
    const o = this.find(orderId);
    const returns = /\breturn\b/.test(source);
    const cases = o.puzzle.publicCases.map((c, i, all) => {
      if (!returns) return { input: c.input, expected: c.output, error: 'solve() devolvió undefined', passed: false };
      const passed = all.length < 2 || i < all.length - 1;
      return { input: c.input, expected: c.output, actual: passed ? c.output : null, passed };
    });
    return { ok: true, cases, durationMs: 1 };
  }

  sabotage(targetPlayerId: string) {
    if (this.condiments < 1) throw Object.assign(new Error('No tienes condimentos'), { status: 409 });
    this.condiments--;
    const bot = this.bots.find((b) => b.playerId === targetPlayerId);
    if (bot) bot.sabotage = CONDIMENT_RULE;
    this.emit('sabotage.applied', { fromPlayerId: this.me ?? 'me', toPlayerId: targetPlayerId, rule: CONDIMENT_RULE });
  }

  private rush() {
    return this.timing !== null && this.now() >= this.timing.rushAt;
  }
}

export type { GameEvent };
