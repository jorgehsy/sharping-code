import {
  ForbiddenError,
  NotFoundError,
  Router,
  UnauthorizedError,
} from '@aws-lambda-powertools/event-handler/http';
import type { Logger } from '@aws-lambda-powertools/logger';
import {
  applySabotage,
  deliveryPoints,
  earnsCondiment,
  getPuzzle as catalogGetPuzzle,
  pickSabotageRule,
  BURNED_DISH_PENALTY,
  RANK_MULTIPLIERS,
  type CatalogPuzzle,
  type SabotageRefusal,
} from '@sharping/game';
import type { emit as platformEmit, GameMeta, OrderItem } from '@sharping/platform';
import type { OrderSummary, RunnerEvent, SabotageRule, SubmitResponse, TakeOrderResponse } from '@sharping/shared';
import { z } from 'zod';
import { ConflictError, NotImplementedError } from './errors.ts';
import type { Repo } from './repo.ts';
import type { Lambdas } from './services.ts';

export interface Deps {
  repo: Pick<
    Repo,
    | 'createGame'
    | 'getMeta'
    | 'playerIdForToken'
    | 'addPlayer'
    | 'getSnapshot'
    | 'startGame'
    | 'getOrder'
    | 'getPlayer'
    | 'getScores'
    | 'setCurrentOrder'
    | 'claimDelivery'
    | 'applyDelivery'
    | 'applyPenalty'
    | 'stickSabotage'
  >;
  /** Puzzle catalog lookup (defaults to the bundled catalog). */
  getPuzzle?: (id: string) => CatalogPuzzle | undefined;
  /** [0,1) source for picking the sabotage rule (defaults to Math.random). */
  random?: () => number;
  emit: typeof platformEmit;
  lambdas: Lambdas;
  now: () => number;
  /** Optional metrics hook (name only; counts 1). */
  count?: (metric: string) => void;
  logger?: Logger;
}

const Nickname = z.string().trim().min(1).max(20);
const Code = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,6}$/);

const nicknameBody = z.object({ nickname: Nickname });
const codeParam = z.object({ code: Code });
const orderParams = z.object({ code: Code, id: z.string().min(1).max(64) });
const submitBody = z.object({ source: z.string().min(1).max(20_000) });
const sabotageBody = z.object({ targetPlayerId: z.string().min(1).max(64) });

const REFUSALS: Record<SabotageRefusal, string> = {
  self: 'you cannot sabotage yourself',
  'no-condiment': 'you have no condiments',
  'target-already-sabotaged': 'that player is already sabotaged',
  blocked: 'no sabotage applies to what that player is cooking',
};

const toSummary = (o: OrderItem): OrderSummary => ({
  orderId: o.orderId,
  title: o.title,
  difficulty: o.difficulty,
  basePoints: o.basePoints,
  openedAt: o.openedAt,
  expiresAt: o.expiresAt,
  deliveries: o.deliveries,
});

/** Orders a client may still act on: game running and the order clock not at zero. */
const openOrders = (meta: GameMeta, orders: readonly OrderItem[], t: number): OrderItem[] =>
  meta.status === 'running'
    ? orders.filter((o) => t < o.expiresAt).sort((a, b) => a.openedAt - b.openedAt || a.orderId.localeCompare(b.orderId))
    : [];

/** 200 with a typed contract body (the router's JSON types do not accept interfaces without index signatures). */
const ok = (body: object) => ({ statusCode: 200, body: body as never });

const NO_CONTENT = { statusCode: 204, body: '' } as const;

export function createApp(deps: Deps): Router {
  const { repo, emit, lambdas, now } = deps;
  const getPuzzle = deps.getPuzzle ?? catalogGetPuzzle;
  const random = deps.random ?? Math.random;
  const app = new Router({ logger: deps.logger });

  app.errorHandler(ConflictError, async (e) => ({ statusCode: 409, body: { message: e.message } }));
  app.errorHandler(NotImplementedError, async (e) => ({ statusCode: 501, body: { message: e.message } }));

  /** META must say `running` and the clock must not have passed `endsAt` (the finish step may lag by a moment). */
  async function requireRunning(code: string, t: number): Promise<GameMeta> {
    const meta = await repo.getMeta(code);
    if (!meta) throw new NotFoundError('game not found');
    if (meta.status !== 'running' || (meta.endsAt !== undefined && t >= meta.endsAt)) {
      throw new ConflictError('game is not running');
    }
    return meta;
  }

  /** x-player-token -> playerId, scoped to the game in the path. 401 if missing/unknown. */
  async function authenticate(req: Request, code: string): Promise<string> {
    const token = req.headers.get('x-player-token');
    if (!token) throw new UnauthorizedError('missing x-player-token');
    const playerId = await repo.playerIdForToken(code, token);
    if (!playerId) throw new UnauthorizedError('invalid token');
    return playerId;
  }

  app.post(
    '/games',
    async (reqCtx) => {
      const { nickname } = reqCtx.valid.req.body;
      const created = await repo.createGame(nickname, now());
      deps.count?.('GameCreated');
      return { statusCode: 201, body: created };
    },
    { validation: { req: { body: nicknameBody } } },
  );

  app.post(
    '/games/:code/players',
    async (reqCtx) => {
      const { code } = reqCtx.valid.req.path;
      const { nickname } = reqCtx.valid.req.body;
      const meta = await repo.getMeta(code);
      if (!meta) throw new NotFoundError('game not found');
      if (meta.status === 'finished') throw new ConflictError('game finished');
      // addPlayer re-checks the status atomically (the game may finish in between).
      const creds = await repo.addPlayer(code, nickname, now());
      if (!creds) throw new ConflictError('game finished');
      await emit(code, [{ type: 'player.joined', data: { playerId: creds.playerId, nickname } }]);
      deps.count?.('PlayerJoined');
      return { statusCode: 201, body: creds };
    },
    { validation: { req: { path: codeParam, body: nicknameBody } } },
  );

  app.get(
    '/games/:code',
    async (reqCtx) => {
      const { code } = reqCtx.valid.req.path;
      const playerId = await authenticate(reqCtx.req, code);
      const snap = await repo.getSnapshot(code);
      if (!snap) throw new NotFoundError('game not found');
      const { meta, players } = snap;
      const t = now();
      const open = openOrders(meta, snap.orders ?? [], t);
      const me = players.find((p) => p.playerId === playerId);
      return ok({
        code,
        status: meta.status,
        hostPlayerId: meta.hostPlayerId,
        createdAt: meta.createdAt,
        startedAt: meta.startedAt ?? null,
        rushAt: meta.rushAt ?? null,
        endsAt: meta.endsAt ?? null,
        /** Server time, so clients can correct clock skew. */
        now: t,
        /** META.seq at read time: events with seq <= this are already reflected in the snapshot. */
        seq: meta.seq ?? 0,
        players: players.map((p) => ({ playerId: p.playerId, nickname: p.nickname, score: p.score })),
        orders: open.map(toSummary),
        me: me && {
          playerId: me.playerId,
          nickname: me.nickname,
          score: me.score,
          // An expired order is no longer "being cooked".
          currentOrderId: open.some((o) => o.orderId === me.currentOrderId) ? (me.currentOrderId ?? null) : null,
          condiments: me.condiments,
          sabotage: (me.sabotage as SabotageRule | undefined) ?? null,
        },
      });
    },
    { validation: { req: { path: codeParam } } },
  );

  app.post(
    '/games/:code/start',
    async (reqCtx) => {
      const { code } = reqCtx.valid.req.path;
      const playerId = await authenticate(reqCtx.req, code);
      const meta = await repo.getMeta(code);
      if (!meta) throw new NotFoundError('game not found');
      if (meta.hostPlayerId !== playerId) throw new ForbiddenError('only the host can start the game');
      const timings = await repo.startGame(code, now());
      if (!timings) throw new ConflictError('game already started');

      // Independent side effects, run in parallel. The clock invoke must succeed; warm-up is best effort.
      await Promise.all([
        emit(code, [{ type: 'game.started', data: timings }]),
        lambdas.startClock({ gameCode: code, ...timings }),
        lambdas.warmRunner(),
      ]);
      deps.count?.('GameStarted');
      return NO_CONTENT;
    },
    { validation: { req: { path: codeParam } } },
  );

  app.post(
    '/games/:code/orders/:id/take',
    async (reqCtx) => {
      const { code, id } = reqCtx.valid.req.path;
      const playerId = await authenticate(reqCtx.req, code);
      const t = now();
      await requireRunning(code, t);
      const order = await repo.getOrder(code, id);
      if (!order) throw new NotFoundError('order not found');
      if (t >= order.expiresAt) throw new ConflictError('order expired');
      const puzzle = getPuzzle(order.puzzleId);
      if (!puzzle) throw new Error(`puzzle ${order.puzzleId} missing from the catalog`);

      // Setting currentOrderId releases the previous order. Re-taking the same order is a no-op (no event).
      const me = await repo.getPlayer(code, playerId);
      if (me?.currentOrderId !== id) {
        await repo.setCurrentOrder(code, playerId, id);
        await emit(code, [{ type: 'order.taken', data: { orderId: id, playerId } }]);
      }
      deps.count?.('OrderTaken');

      const body: TakeOrderResponse = {
        ...toSummary(order),
        statement: puzzle.statement,
        signature: puzzle.signature,
        publicCases: puzzle.cases.public, // never the hidden ones
      };
      return ok(body);
    },
    { validation: { req: { path: orderParams } } },
  );

  app.post(
    '/games/:code/orders/:id/submit',
    async (reqCtx) => {
      const { code, id } = reqCtx.valid.req.path;
      const { source } = reqCtx.valid.req.body;
      const playerId = await authenticate(reqCtx.req, code);
      // One timestamp for the whole delivery: expiry, rush hour and ranking use the moment the request arrived,
      // so runner latency never costs the player the order clock or the rush multiplier.
      const t = now();
      const meta = await requireRunning(code, t);
      const order = await repo.getOrder(code, id);
      if (!order) throw new NotFoundError('order not found');
      if (t >= order.expiresAt) throw new ConflictError('order expired');
      const me = await repo.getPlayer(code, playerId);
      if (!me) throw new UnauthorizedError('invalid token');
      if (me.currentOrderId !== id) throw new ConflictError('take the order before submitting');
      if (order.deliveredBy?.has(playerId)) throw new ConflictError('you already delivered this order');
      const puzzle = getPuzzle(order.puzzleId);
      if (!puzzle) throw new Error(`puzzle ${order.puzzleId} missing from the catalog`);

      const runnerEvent: RunnerEvent = {
        source,
        entry: 'solve',
        cases: [...puzzle.cases.public, ...puzzle.cases.hidden.map((c) => ({ ...c, hidden: true }))],
        ...(me.sabotage ? { sabotage: me.sabotage as SabotageRule } : {}),
      };
      const result = await lambdas.runCode(runnerEvent);

      if (!result.passed) {
        await repo.applyPenalty(code, playerId, BURNED_DISH_PENALTY, t);
        const scores = await repo.getScores(code);
        await emit(code, [{ type: 'dish.burned', data: { playerId, orderId: id, penalty: BURNED_DISH_PENALTY, scores } }]);
        deps.count?.('DishBurned');
        // Hidden failures must not carry any case data, whatever the runner returned.
        const { case: failedCase, ...rest } = result;
        const body: SubmitResponse = {
          ...rest,
          ...(result.hidden || !failedCase ? {} : { case: failedCase }),
          penalty: BURNED_DISH_PENALTY,
          scores,
        };
        return ok(body);
      }

      const claim = await repo.claimDelivery(code, id, playerId, t, RANK_MULTIPLIERS.length);
      let rank: number;
      if (claim.ok) rank = claim.rank;
      else if (claim.reason === 'full') rank = RANK_MULTIPLIERS.length + 1; // correct, but too late to score
      else if (claim.reason === 'missing') throw new NotFoundError('order not found');
      else if (claim.reason === 'expired') throw new ConflictError('order expired');
      else throw new ConflictError('you already delivered this order');

      const ranked = rank <= RANK_MULTIPLIERS.length;
      const points = deliveryPoints({
        difficulty: order.difficulty,
        rank,
        deliveredAt: t,
        rushAt: meta.rushAt ?? Number.POSITIVE_INFINITY,
      });
      const applied = await repo.applyDelivery(code, playerId, {
        points,
        condiment: earnsCondiment(order.difficulty, rank),
        now: t,
      });
      const scores = await repo.getScores(code);

      const events: Parameters<typeof emit>[1] = [];
      if (ranked) events.push({ type: 'order.delivered', data: { orderId: id, playerId, rank, points, scores } });
      if (applied.condimentEarned) events.push({ type: 'condiment.earned', data: { playerId } });
      if (applied.clearedSabotage) events.push({ type: 'sabotage.cleared', data: { playerId } });
      await emit(code, events);
      deps.count?.('OrderDelivered');

      const body: SubmitResponse = { passed: true, rank, points, scores };
      return ok(body);
    },
    { validation: { req: { path: orderParams, body: submitBody } } },
  );

  app.post(
    '/games/:code/sabotages',
    async (reqCtx) => {
      const { code } = reqCtx.valid.req.path;
      const { targetPlayerId } = reqCtx.valid.req.body;
      const attackerId = await authenticate(reqCtx.req, code);
      await requireRunning(code, now());
      const [attacker, target] = await Promise.all([repo.getPlayer(code, attackerId), repo.getPlayer(code, targetPlayerId)]);
      if (!attacker) throw new UnauthorizedError('invalid token');
      if (!target) throw new NotFoundError('target player not found');

      // Rules the target's current puzzle blocks are excluded from the random pick.
      const targetOrder = target.currentOrderId ? await repo.getOrder(code, target.currentOrderId) : undefined;
      const blocked = (targetOrder && getPuzzle(targetOrder.puzzleId)?.blockedSabotages) || [];
      const rule = pickSabotageRule(blocked, random);

      const check = (a: typeof attacker, tg: typeof target, r: SabotageRule) =>
        applySabotage({
          attackerId,
          targetId: targetPlayerId,
          attacker: { condiments: a.condiments, active: (a.sabotage as SabotageRule | undefined) ?? null },
          target: { condiments: tg.condiments, active: (tg.sabotage as SabotageRule | undefined) ?? null },
          rule: r,
          blockedSabotages: blocked,
        });

      // `rule` is undefined only when every rule is blocked; the placeholder makes applySabotage report `blocked`.
      const verdict = check(attacker, target, rule ?? 'no-loops');
      if (!verdict.ok) throw new ConflictError(REFUSALS[verdict.reason]);

      if (!rule || !(await repo.stickSabotage(code, attackerId, targetPlayerId, rule))) {
        // Lost a race (condiment spent, target sabotaged by someone else, game ended): explain with fresh state.
        const [a2, t2] = await Promise.all([repo.getPlayer(code, attackerId), repo.getPlayer(code, targetPlayerId)]);
        const again = a2 && t2 && rule ? check(a2, t2, rule) : undefined;
        throw new ConflictError(again && !again.ok ? REFUSALS[again.reason] : 'could not apply the sabotage, try again');
      }
      await emit(code, [
        { type: 'sabotage.applied', data: { fromPlayerId: attackerId, toPlayerId: targetPlayerId, rule } },
      ]);
      deps.count?.('SabotageApplied');
      return NO_CONTENT;
    },
    { validation: { req: { path: codeParam, body: sabotageBody } } },
  );

  return app;
}
