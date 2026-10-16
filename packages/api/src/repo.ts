import { randomInt, randomUUID } from 'node:crypto';
import { GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  gameKey,
  getDocClient,
  orderKey,
  ORDER_SK_PREFIX,
  PLAYER_SK_PREFIX,
  playerKey,
  tableName,
  tokenKey,
  ttlFor,
  type GameMeta,
  type OrderItem,
  type PlayerItem,
  type TokenItem,
} from '@sharping/platform';
import { MAX_CONDIMENTS } from '@sharping/game';
import { GAME_DURATION_MS, RUSH_DURATION_MS, type SabotageRule } from '@sharping/shared';

/** No 0/O/1/I: codes are typed by hand. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const MAX_CODE_ATTEMPTS = 5;

export const generateCode = (): string =>
  Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

export type Credentials = { playerId: string; playerToken: string };

export interface Timings {
  startedAt: number;
  rushAt: number;
  endsAt: number;
}

export interface Snapshot {
  meta: GameMeta;
  players: PlayerItem[];
  /** All ORDER# items (open and expired); the caller filters by time. */
  orders: OrderItem[];
}

export type ClaimResult =
  | { ok: true; rank: number }
  | { ok: false; reason: 'full' | 'duplicate' | 'expired' | 'missing' };

const isConditionFailure = (e: unknown): boolean => {
  const err = e as { name?: string; CancellationReasons?: { Code?: string }[] };
  if (err?.name === 'ConditionalCheckFailedException') return true;
  return (
    err?.name === 'TransactionCanceledException' &&
    (err.CancellationReasons ?? []).some((r) => r.Code === 'ConditionalCheckFailed')
  );
};

function playerItems(code: string, nickname: string, now: number): { player: PlayerItem; token: TokenItem } & Credentials {
  const playerId = randomUUID();
  const playerToken = randomUUID();
  const ttl = ttlFor(now);
  return {
    playerId,
    playerToken,
    player: { ...playerKey(code, playerId), playerId, nickname, score: 0, joinedAt: now, condiments: 0, ttl },
    token: { ...tokenKey(code, playerToken), playerId, ttl },
  };
}

async function fetchOrder(code: string, orderId: string): Promise<OrderItem | undefined> {
  const res = await getDocClient().send(
    new GetCommand({ TableName: tableName(), Key: orderKey(code, orderId), ConsistentRead: true }),
  );
  return res.Item as OrderItem | undefined;
}

/** Data access for the lambdalith. Thin wrappers over the platform doc client. */
export const repo = {
  /** Create META + host PLAYER + TOKEN in one transaction; retries on code collision. */
  async createGame(nickname: string, now: number): Promise<Credentials & { code: string }> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateCode();
      const { player, token, playerId, playerToken } = playerItems(code, nickname, now);
      const meta: GameMeta = {
        ...gameKey(code),
        status: 'lobby',
        hostPlayerId: playerId,
        createdAt: now,
        seq: 0,
        ttl: ttlFor(now),
      };
      try {
        await getDocClient().send(
          new TransactWriteCommand({
            TransactItems: [
              { Put: { TableName: tableName(), Item: meta, ConditionExpression: 'attribute_not_exists(pk)' } },
              { Put: { TableName: tableName(), Item: player } },
              { Put: { TableName: tableName(), Item: token } },
            ],
          }),
        );
        return { code, playerId, playerToken };
      } catch (e) {
        if (!isConditionFailure(e)) throw e;
      }
    }
    throw new Error('could not allocate a game code');
  },

  async getMeta(code: string): Promise<GameMeta | undefined> {
    const res = await getDocClient().send(
      new GetCommand({ TableName: tableName(), Key: gameKey(code), ConsistentRead: true }),
    );
    return res.Item as GameMeta | undefined;
  },

  /** token -> playerId (one GetItem). */
  async playerIdForToken(code: string, playerToken: string): Promise<string | undefined> {
    const res = await getDocClient().send(new GetCommand({ TableName: tableName(), Key: tokenKey(code, playerToken) }));
    return (res.Item as TokenItem | undefined)?.playerId;
  },

  /**
   * Add a PLAYER + TOKEN. The META condition (not finished) makes the check atomic.
   * Returns undefined if the game is finished (or does not exist).
   */
  async addPlayer(code: string, nickname: string, now: number): Promise<Credentials | undefined> {
    const { player, token, playerId, playerToken } = playerItems(code, nickname, now);
    try {
      await getDocClient().send(
        new TransactWriteCommand({
          TransactItems: [
            {
              ConditionCheck: {
                TableName: tableName(),
                Key: gameKey(code),
                ConditionExpression: '#s IN (:lobby, :running)',
                ExpressionAttributeNames: { '#s': 'status' },
                ExpressionAttributeValues: { ':lobby': 'lobby', ':running': 'running' },
              },
            },
            { Put: { TableName: tableName(), Item: player } },
            { Put: { TableName: tableName(), Item: token } },
          ],
        }),
      );
    } catch (e) {
      if (isConditionFailure(e)) return undefined;
      throw e;
    }
    return { playerId, playerToken };
  },

  /** META + PLAYER + ORDER items of a game (one consistent Query; tokens are never returned). `meta.seq` is the snapshot seq. */
  async getSnapshot(code: string): Promise<Snapshot | undefined> {
    const res = await getDocClient().send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': `GAME#${code}` },
        ConsistentRead: true,
      }),
    );
    const items = (res.Items ?? []) as { sk: string }[];
    const meta = items.find((i) => i.sk === 'META') as GameMeta | undefined;
    if (!meta) return undefined;
    const players = items.filter((i) => i.sk.startsWith(PLAYER_SK_PREFIX)) as PlayerItem[];
    const orders = items.filter((i) => i.sk.startsWith(ORDER_SK_PREFIX)) as OrderItem[];
    return { meta, players, orders };
  },

  getOrder: fetchOrder,

  async getPlayer(code: string, playerId: string): Promise<PlayerItem | undefined> {
    const res = await getDocClient().send(
      new GetCommand({ TableName: tableName(), Key: playerKey(code, playerId), ConsistentRead: true }),
    );
    return res.Item as PlayerItem | undefined;
  },

  /** Score of every player (consistent read; used for the `scores` of events and responses). */
  async getScores(code: string): Promise<Record<string, number>> {
    const res = await getDocClient().send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :p)',
        ExpressionAttributeValues: { ':pk': `GAME#${code}`, ':p': PLAYER_SK_PREFIX },
        ConsistentRead: true,
      }),
    );
    return Object.fromEntries(((res.Items ?? []) as PlayerItem[]).map((p) => [p.playerId, p.score]));
  },

  /** Point the player at an order (implicitly releases the previous one). */
  async setCurrentOrder(code: string, playerId: string, orderId: string): Promise<void> {
    await getDocClient().send(
      new UpdateCommand({
        TableName: tableName(),
        Key: playerKey(code, playerId),
        UpdateExpression: 'SET currentOrderId = :o',
        ConditionExpression: 'attribute_exists(pk)',
        ExpressionAttributeValues: { ':o': orderId },
      }),
    );
  },

  /**
   * Claim the next delivery rank of an order: conditional `deliveries < 3` increment (the value after the
   * increment is the rank). One ranked delivery per player per order; refused if the order expired at `now`.
   * When the 3 ranked slots are taken, reports `full` (a 4th+ correct delivery scores nothing).
   */
  async claimDelivery(code: string, orderId: string, playerId: string, now: number, maxRanked: number): Promise<ClaimResult> {
    try {
      const res = await getDocClient().send(
        new UpdateCommand({
          TableName: tableName(),
          Key: orderKey(code, orderId),
          UpdateExpression:
            'ADD deliveries :one, deliveredBy :me SET deliveredOrder = list_append(if_not_exists(deliveredOrder, :empty), :meList)',
          ConditionExpression:
            'attribute_exists(pk) AND deliveries < :max AND expiresAt > :now AND (attribute_not_exists(deliveredBy) OR NOT contains(deliveredBy, :pid))',
          ExpressionAttributeValues: { ':one': 1, ':me': new Set([playerId]), ':meList': [playerId], ':empty': [], ':pid': playerId, ':max': maxRanked, ':now': now },
          ReturnValues: 'UPDATED_NEW',
        }),
      );
      return { ok: true, rank: res.Attributes!.deliveries as number };
    } catch (e) {
      if (!isConditionFailure(e)) throw e;
    }
    // Why was it refused? (rare path: one extra read)
    const order = await fetchOrder(code, orderId);
    if (!order) return { ok: false, reason: 'missing' };
    if (order.expiresAt <= now) return { ok: false, reason: 'expired' };
    if (order.deliveredBy?.has(playerId)) return { ok: false, reason: 'duplicate' };
    return { ok: false, reason: 'full' };
  },

  /**
   * Apply a correct delivery to the player: add points, count the solve, add `condiments` (as many as fit under the
   * cap), clear the sabotage. Returns whether a sabotage was cleared and how many condiments were granted.
   */
  async applyDelivery(
    code: string,
    playerId: string,
    d: { points: number; condiments: number; now: number },
  ): Promise<{ clearedSabotage: boolean; condimentsEarned: number }> {
    const run = (n: number) =>
      getDocClient().send(
        new UpdateCommand({
          TableName: tableName(),
          Key: playerKey(code, playerId),
          UpdateExpression:
            `ADD score :pts, solved :one${n > 0 ? ', condiments :n' : ''} ` +
            `SET scoreUpdatedAt = ${d.points !== 0 ? ':now' : 'if_not_exists(scoreUpdatedAt, :now)'} REMOVE sabotage`,
          ConditionExpression:
            n > 0 ? 'attribute_exists(pk) AND (attribute_not_exists(condiments) OR condiments <= :room)' : 'attribute_exists(pk)',
          ExpressionAttributeValues: {
            ':pts': d.points,
            ':one': 1,
            ':now': d.now,
            ...(n > 0 ? { ':n': n, ':room': MAX_CONDIMENTS - n } : {}),
          },
          ReturnValues: 'ALL_OLD',
        }),
      );
    // Try the full grant, then one less each time the cap refuses it (n <= 2: at most 3 writes).
    for (let n = d.condiments; ; n--) {
      try {
        const old = (await run(n)).Attributes as Partial<PlayerItem> | undefined;
        return { clearedSabotage: old?.sabotage !== undefined, condimentsEarned: n };
      } catch (e) {
        if (n <= 0 || !isConditionFailure(e)) throw e;
      }
    }
  },

  /** Subtract the burned-dish penalty. */
  async applyPenalty(code: string, playerId: string, penalty: number, now: number): Promise<void> {
    await getDocClient().send(
      new UpdateCommand({
        TableName: tableName(),
        Key: playerKey(code, playerId),
        UpdateExpression: 'ADD score :neg SET scoreUpdatedAt = :now',
        ConditionExpression: 'attribute_exists(pk)',
        ExpressionAttributeValues: { ':neg': -penalty, ':now': now },
      }),
    );
  },

  /**
   * Spend one condiment of the attacker and stick the rule on the target, atomically. Conditions guard the races:
   * attacker still has a condiment, target has no active sabotage, game still running.
   * Returns false if any condition failed (the caller re-reads to explain why).
   */
  async stickSabotage(code: string, attackerId: string, targetId: string, rule: SabotageRule): Promise<boolean> {
    try {
      await getDocClient().send(
        new TransactWriteCommand({
          TransactItems: [
            {
              ConditionCheck: {
                TableName: tableName(),
                Key: gameKey(code),
                ConditionExpression: '#s = :running',
                ExpressionAttributeNames: { '#s': 'status' },
                ExpressionAttributeValues: { ':running': 'running' },
              },
            },
            {
              Update: {
                TableName: tableName(),
                Key: playerKey(code, attackerId),
                UpdateExpression: 'SET condiments = condiments - :one',
                ConditionExpression: 'condiments >= :one',
                ExpressionAttributeValues: { ':one': 1 },
              },
            },
            {
              Update: {
                TableName: tableName(),
                Key: playerKey(code, targetId),
                UpdateExpression: 'SET sabotage = :rule',
                ConditionExpression: 'attribute_exists(pk) AND attribute_not_exists(sabotage)',
                ExpressionAttributeValues: { ':rule': rule },
              },
            },
          ],
        }),
      );
      return true;
    } catch (e) {
      if (isConditionFailure(e)) return false;
      throw e;
    }
  },

  /** Conditional lobby -> running. Returns the timings, or undefined if the game was not in lobby. */
  async startGame(code: string, now: number): Promise<Timings | undefined> {
    const timings: Timings = {
      startedAt: now,
      endsAt: now + GAME_DURATION_MS,
      rushAt: now + GAME_DURATION_MS - RUSH_DURATION_MS,
    };
    try {
      await getDocClient().send(
        new UpdateCommand({
          TableName: tableName(),
          Key: gameKey(code),
          UpdateExpression: 'SET #s = :running, startedAt = :startedAt, rushAt = :rushAt, endsAt = :endsAt',
          ConditionExpression: '#s = :lobby',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':running': 'running', ':lobby': 'lobby', ...prefixed(timings) },
        }),
      );
    } catch (e) {
      if (isConditionFailure(e)) return undefined;
      throw e;
    }
    return timings;
  },
};

const prefixed = (t: Timings) => ({ ':startedAt': t.startedAt, ':rushAt': t.rushAt, ':endsAt': t.endsAt });

export type Repo = typeof repo;
