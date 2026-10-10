// Pure scheduling logic. No Date.now / Math.random / I/O in here (durable replay model, ADR 0002).
import type { ClockInput, Difficulty } from '@sharping/shared';
import { BASE_POINTS, ORDER_CLOCK_MS, type PuzzleRef } from './game.ts';

/** Orders visible at the same time ("~5 comandas"). */
export const ORDER_SLOTS = 5;

/** A difficulty is only offered if at least this fraction of its clock fits before the game ends. */
export const MIN_CLOCK_FRACTION = 0.5;

/** Relative odds of the next order's difficulty (initial slots use a fixed mix instead). */
const DIFFICULTY_WEIGHTS: Record<Difficulty, number> = { easy: 4, medium: 3, hard: 2 };
const INITIAL_MIX: readonly Difficulty[] = ['easy', 'easy', 'medium', 'medium', 'hard'];

export interface PlannedOrder {
  orderId: string;
  puzzleId: string;
  title: string;
  difficulty: Difficulty;
  basePoints: number;
  /** Epoch ms. */
  openedAt: number;
  /** Epoch ms. Capped at the game end. */
  expiresAt: number;
}

export type ClockAction =
  | { kind: 'open'; order: PlannedOrder }
  | { kind: 'expire'; orderId: string }
  | { kind: 'rush' }
  | { kind: 'finish' };

/** All actions decided at the same instant: one step. */
export interface PlannedTick {
  /** Epoch ms of the tick (when the decision was taken). */
  plannedAt: number;
  actions: ClockAction[];
}

/** mulberry32 seeded from a string (FNV-1a). Deterministic across replays. */
export function seededRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

/** Deliveries after which an order is full: nobody can deliver it, so its slot is free again. */
export const MAX_DELIVERIES = 3;

/** What the clock persists between ticks (JSON-safe: it is a step result). */
export interface ClockState {
  /** Orders opened so far (ids `o01`, `o02`...). Also seeds the rng of the next tick. */
  counter: number;
  /** Times each puzzle has been opened. */
  used: Record<string, number>;
  rushDone: boolean;
  finished: boolean;
  /** Time of the previous tick (epoch ms): expirations are reported once, in (lastTickAt, now]. */
  lastTickAt: number;
}

export const initialClockState = (input: Pick<ClockInput, 'startedAt'>): ClockState => ({
  counter: 0,
  used: {},
  rushDone: false,
  finished: false,
  lastTickAt: input.startedAt - 1,
});

/** The part of an ORDER# item the clock needs. */
export interface OrderView {
  orderId: string;
  puzzleId: string;
  expiresAt: number;
  deliveries: number;
}

export interface TickDecision {
  /** Sorted: expirations, openings, rush, finish. */
  actions: ClockAction[];
  state: ClockState;
  /** Epoch ms of the next moment the clock must act without outside help; null once finished. */
  nextWakeAt: number | null;
}

/**
 * Reactive scheduling: given what exists in the table at `now`, decide what to do. Pure (no clock, no I/O); the rng is
 * seeded by game code + order counter so a retried tick decides the same.
 *
 * Slots: ORDER_SLOTS. An order occupies its slot until it expires OR is full (MAX_DELIVERIES). A free slot gets a
 * new order right away.
 * - Expiry: `order.expired` only for orders that are not full (clients already dropped full ones on the 3rd
 *   `order.delivered`) and whose expiry is before `endsAt` (the game end closes everything with `game.finished`).
 * - Difficulty must have puzzles and at least MIN_CLOCK_FRACTION of its clock left before `endsAt`; if none
 *   qualifies the slot stays empty. `expiresAt` is capped at `endsAt`.
 * - Puzzle choice: least-used first among puzzles of that difficulty not currently open; repeats only when needed.
 * - The first fill (counter 0) follows INITIAL_MIX; later openings pick a difficulty by weight.
 */
export function decideTick(args: {
  now: number;
  orders: readonly OrderView[];
  state: ClockState;
  puzzles: readonly PuzzleRef[];
  input: ClockInput;
}): TickDecision {
  const { now, orders, input, puzzles } = args;
  const state: ClockState = { ...args.state, used: { ...args.state.used } };
  const actions: ClockAction[] = [];
  const byDifficulty = new Map<Difficulty, PuzzleRef[]>(DIFFICULTIES.map((d) => [d, puzzles.filter((p) => p.difficulty === d)]));

  if (!state.finished) {
    for (const o of [...orders].sort((a, b) => a.orderId.localeCompare(b.orderId))) {
      const expired = o.expiresAt > state.lastTickAt && o.expiresAt <= now;
      if (expired && o.deliveries < MAX_DELIVERIES && o.expiresAt < input.endsAt) actions.push({ kind: 'expire', orderId: o.orderId });
    }
  }

  const live = orders.filter((o) => o.expiresAt > now && o.deliveries < MAX_DELIVERIES);
  const openPuzzles = new Set(live.map((o) => o.puzzleId));
  const rng = seededRng(`${input.gameCode}:${state.counter}`);
  const initial = state.counter === 0;
  const opened: { orderId: string; expiresAt: number }[] = [];

  let filled = 0;
  while (!state.finished && live.length + opened.length < ORDER_SLOTS) {
    const remaining = input.endsAt - now;
    const allowed = DIFFICULTIES.filter((d) => byDifficulty.get(d)!.length > 0 && remaining >= ORDER_CLOCK_MS[d] * MIN_CLOCK_FRACTION);
    if (allowed.length === 0) break;

    const wanted = initial ? INITIAL_MIX[filled % INITIAL_MIX.length]! : weightedPick(allowed, rng);
    const difficulty = allowed.includes(wanted)
      ? wanted
      : [...allowed].sort((a, b) => Math.abs(rank(a) - rank(wanted)) - Math.abs(rank(b) - rank(wanted)))[0]!;

    const pool = byDifficulty.get(difficulty)!;
    const fresh = pool.filter((p) => !openPuzzles.has(p.id));
    const candidates = fresh.length > 0 ? fresh : pool;
    const least = Math.min(...candidates.map((p) => state.used[p.id] ?? 0));
    const tied = candidates.filter((p) => (state.used[p.id] ?? 0) === least);
    const puzzle = tied[Math.floor(rng() * tied.length)]!;
    state.used[puzzle.id] = (state.used[puzzle.id] ?? 0) + 1;
    openPuzzles.add(puzzle.id);

    const orderId = `o${String(++state.counter).padStart(2, '0')}`;
    const expiresAt = Math.min(now + ORDER_CLOCK_MS[difficulty], input.endsAt);
    actions.push({
      kind: 'open',
      order: { orderId, puzzleId: puzzle.id, title: puzzle.title, difficulty, basePoints: BASE_POINTS[difficulty], openedAt: now, expiresAt },
    });
    opened.push({ orderId, expiresAt });
    filled++;
  }

  if (!state.finished && !state.rushDone && now >= input.rushAt) {
    actions.push({ kind: 'rush' });
    state.rushDone = true;
  }
  if (!state.finished && now >= input.endsAt) {
    actions.push({ kind: 'finish' });
    state.finished = true;
  }
  state.lastTickAt = now;

  let nextWakeAt: number | null = null;
  if (!state.finished) {
    // Orders ending with the game are closed by game.finished (endsAt below), not by their own expiry.
    const wakes = [input.endsAt, ...(state.rushDone ? [] : [input.rushAt])];
    for (const o of [...live, ...opened]) if (o.expiresAt < input.endsAt) wakes.push(o.expiresAt);
    nextWakeAt = Math.min(...wakes);
  }
  return { actions, state, nextWakeAt };
}

const rank = (d: Difficulty) => DIFFICULTIES.indexOf(d);

function weightedPick(options: readonly Difficulty[], rng: () => number): Difficulty {
  const total = options.reduce((s, d) => s + DIFFICULTY_WEIGHTS[d], 0);
  let r = rng() * total;
  for (const d of options) {
    r -= DIFFICULTY_WEIGHTS[d];
    if (r < 0) return d;
  }
  return options[options.length - 1]!;
}

/**
 * Whole seconds to durably wait so we wake up slightly BEFORE the target (`ctx.wait` takes integer
 * seconds and resume has latency). The remainder is slept inside the step.
 * Returns 0 when no wait is worthwhile (already late or within the margin).
 */
export function planWaitSeconds(remainingMs: number, marginMs: number): number {
  const w = Math.floor((remainingMs - marginMs) / 1000);
  return w > 0 ? w : 0;
}

/** Podium (top 3 playerIds) and scores. Ties: whoever reached the score first (`reachedAt`, else join order). */
export function computeResults(players: ReadonlyArray<{ playerId: string; score: number; scoreUpdatedAt?: number; joinedAt?: number }>) {
  const sorted = [...players]
    .map((p) => ({ playerId: p.playerId, score: p.score, reachedAt: p.scoreUpdatedAt ?? p.joinedAt ?? 0 }))
    .sort((a, b) => b.score - a.score || a.reachedAt - b.reachedAt);
  return {
    podium: sorted.slice(0, 3).map((p) => p.playerId),
    scores: Object.fromEntries(players.map((p) => [p.playerId, p.score])) as Record<string, number>,
  };
}
