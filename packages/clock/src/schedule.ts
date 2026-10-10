// Pure scheduling logic. No Date.now / Math.random / I/O in here (durable replay model, ADR 0002).
import type { ClockInput, Difficulty } from '@sharping/shared';
import { BASE_POINTS, ORDER_CLOCK_MS, PUZZLES, type PuzzleRef } from './game.ts';

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

/** All actions due at the same instant: one durable wait + one step. */
export interface PlannedTick {
  /** Epoch ms. */
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

/**
 * Plans the order rotation: ORDER_SLOTS slots; every slot opens an order at `startedAt` and, when it expires,
 * immediately opens another one in the same slot.
 *
 * Rules:
 * - Difficulty must have puzzles in the catalog and at least MIN_CLOCK_FRACTION of its clock left before `endsAt`.
 *   If none qualifies the slot stays empty for the rest of the game.
 * - `expiresAt` is capped at `endsAt` (an order never outlives the game). Orders that end with the game get no
 *   `order.expired` action: `game.finished` closes everything.
 * - Puzzle choice: least-used first among puzzles of that difficulty not currently open; repeats only when needed.
 */
export function planOrders(
  input: Pick<ClockInput, 'gameCode' | 'startedAt' | 'endsAt'>,
  puzzles: readonly PuzzleRef[],
): PlannedTick[] {
  const rng = seededRng(input.gameCode);
  const byDifficulty = new Map<Difficulty, PuzzleRef[]>(DIFFICULTIES.map((d) => [d, puzzles.filter((p) => p.difficulty === d)]));
  const used = new Map<string, number>();
  const open = new Map<string, string>(); // orderId -> puzzleId currently open
  const ticks = new Map<number, ClockAction[]>();
  const add = (at: number, a: ClockAction) => ticks.set(at, [...(ticks.get(at) ?? []), a]);

  let counter = 0;
  // Slot queue: (time the slot frees up, orderId expiring then or null for the initial fill).
  const pending: { at: number; expiring: string | null; slot: number }[] = Array.from({ length: ORDER_SLOTS }, (_, slot) => ({
    at: input.startedAt,
    expiring: null,
    slot,
  }));

  while (pending.length > 0) {
    pending.sort((a, b) => a.at - b.at || a.slot - b.slot);
    const { at, expiring, slot } = pending.shift()!;
    if (expiring) {
      add(at, { kind: 'expire', orderId: expiring });
      open.delete(expiring);
    }

    const remaining = input.endsAt - at;
    const allowed = DIFFICULTIES.filter(
      (d) => byDifficulty.get(d)!.length > 0 && remaining >= ORDER_CLOCK_MS[d] * MIN_CLOCK_FRACTION,
    );
    if (allowed.length === 0) continue;

    const wanted = expiring === null ? INITIAL_MIX[slot % INITIAL_MIX.length]! : weightedPick(allowed, rng);
    const difficulty = allowed.includes(wanted)
      ? wanted
      : [...allowed].sort((a, b) => Math.abs(rank(a) - rank(wanted)) - Math.abs(rank(b) - rank(wanted)))[0]!;

    const pool = byDifficulty.get(difficulty)!;
    const openIds = new Set(open.values());
    const fresh = pool.filter((p) => !openIds.has(p.id));
    const candidates = fresh.length > 0 ? fresh : pool;
    const least = Math.min(...candidates.map((p) => used.get(p.id) ?? 0));
    const tied = candidates.filter((p) => (used.get(p.id) ?? 0) === least);
    const puzzle = tied[Math.floor(rng() * tied.length)]!;
    used.set(puzzle.id, (used.get(puzzle.id) ?? 0) + 1);

    const orderId = `o${String(++counter).padStart(2, '0')}`;
    const expiresAt = Math.min(at + ORDER_CLOCK_MS[difficulty], input.endsAt);
    open.set(orderId, puzzle.id);
    add(at, {
      kind: 'open',
      order: { orderId, puzzleId: puzzle.id, title: puzzle.title, difficulty, basePoints: BASE_POINTS[difficulty], openedAt: at, expiresAt },
    });
    // Orders ending with the game are closed by game.finished, not by their own expiry.
    if (expiresAt < input.endsAt) pending.push({ at: expiresAt, expiring: orderId, slot });
  }

  return [...ticks.entries()].sort((a, b) => a[0] - b[0]).map(([plannedAt, actions]) => ({ plannedAt, actions }));
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
 * Every tick the clock must run, sorted by time: order rotation, `rush.started` and `game.finished`.
 * Within a tick: expirations, then openings, then rush, then finish.
 */
export function buildSchedule(input: ClockInput, puzzles: readonly PuzzleRef[] = PUZZLES): PlannedTick[] {
  const ticks = new Map<number, ClockAction[]>();
  const add = (at: number, a: ClockAction) => ticks.set(at, [...(ticks.get(at) ?? []), a]);
  for (const t of planOrders(input, puzzles)) for (const a of t.actions) add(t.plannedAt, a);
  add(input.rushAt, { kind: 'rush' });
  add(input.endsAt, { kind: 'finish' });
  const order = { expire: 0, open: 1, rush: 2, finish: 3 } as const;
  return [...ticks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([plannedAt, actions]) => ({ plannedAt, actions: [...actions].sort((x, y) => order[x.kind] - order[y.kind]) }));
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
