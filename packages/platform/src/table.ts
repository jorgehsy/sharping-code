import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Difficulty } from '@sharping/shared';

/** Single-table design. See docs/data-model.md. */

export type GameStatus = 'lobby' | 'running' | 'finished';

/** Items live 24h after creation (DynamoDB TTL, epoch seconds). */
export const TTL_SECONDS = 24 * 60 * 60;

export interface Key {
  pk: string;
  sk: string;
}

export interface GameMeta extends Key {
  status: GameStatus;
  hostPlayerId: string;
  createdAt: number;
  startedAt?: number;
  rushAt?: number;
  endsAt?: number;
  /** Callback id of the clock's current `waitForCallback`: the API completes it on the 3rd delivery of an order to wake the clock early. */
  clockCallbackId?: string;
  /** Last event seq reserved (events are numbered from 1). */
  seq: number;
  ttl: number;
}

export interface PlayerItem extends Key {
  playerId: string;
  nickname: string;
  score: number;
  joinedAt: number;
  currentOrderId?: string;
  condiments: number;
  /** Correct deliveries so far (any rank). Absent on players created before it existed. */
  solved?: number;
  sabotage?: string;
  /** Epoch ms of the last score change (tie-break: who reached the score first). */
  scoreUpdatedAt?: number;
  ttl: number;
}

export interface TokenItem extends Key {
  playerId: string;
  ttl: number;
}

export interface OrderItem extends Key {
  orderId: string;
  puzzleId: string;
  title: string;
  difficulty: Difficulty;
  basePoints: number;
  openedAt: number;
  expiresAt: number;
  /** Incremented with a conditional update; the value after increment is the delivery rank. */
  deliveries: number;
  /** Players with a correct (ranked) delivery; one per player per order. */
  deliveredBy?: Set<string>;
  /** Same players as `deliveredBy`, in arrival order (index = rank - 1); the set is unordered. */
  deliveredOrder?: string[];
  ttl: number;
}

export const gameKey = (code: string): Key => ({ pk: `GAME#${code}`, sk: 'META' });
export const playerKey = (code: string, playerId: string): Key => ({ pk: `GAME#${code}`, sk: `PLAYER#${playerId}` });
export const tokenKey = (code: string, playerToken: string): Key => ({ pk: `GAME#${code}`, sk: `TOKEN#${playerToken}` });
export const orderKey = (code: string, orderId: string): Key => ({ pk: `GAME#${code}`, sk: `ORDER#${orderId}` });

export const PLAYER_SK_PREFIX = 'PLAYER#';
export const ORDER_SK_PREFIX = 'ORDER#';

/** TTL attribute value (epoch seconds) for an item created at `nowMs`. */
export const ttlFor = (nowMs: number) => Math.floor(nowMs / 1000) + TTL_SECONDS;

export const tableName = (): string => {
  const name = process.env.TABLE_NAME;
  if (!name) throw new Error('TABLE_NAME env var is not set');
  return name;
};

let cached: DynamoDBDocumentClient | undefined;

/** Shared document client (reused across warm invocations). */
export function getDocClient(): DynamoDBDocumentClient {
  cached ??= DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  return cached;
}

/** For tests. */
export function setDocClient(client: DynamoDBDocumentClient | undefined) {
  cached = client;
}

/** All PLAYER items of a game. */
export async function listPlayers(code: string): Promise<PlayerItem[]> {
  const res = await getDocClient().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :p)',
      ExpressionAttributeValues: { ':pk': `GAME#${code}`, ':p': PLAYER_SK_PREFIX },
    }),
  );
  return (res.Items ?? []) as PlayerItem[];
}

/** Set META.status (idempotent). */
export async function setGameStatus(code: string, status: GameStatus): Promise<void> {
  await getDocClient().send(
    new UpdateCommand({
      TableName: tableName(),
      Key: gameKey(code),
      UpdateExpression: 'SET #s = :s',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':s': status },
    }),
  );
}

/** Create an ORDER# item. Idempotent: if it already exists (step retry) nothing changes, so `deliveries` is never reset. */
export async function putOrderIfAbsent(item: OrderItem): Promise<void> {
  try {
    await getDocClient().send(
      new PutCommand({ TableName: tableName(), Item: item, ConditionExpression: 'attribute_not_exists(pk)' }),
    );
  } catch (e) {
    if ((e as { name?: string }).name !== 'ConditionalCheckFailedException') throw e;
  }
}

/** All ORDER# items of a game (consistent read: `deliveries` must be current). */
export async function listOrders(code: string): Promise<OrderItem[]> {
  const res = await getDocClient().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :p)',
      ExpressionAttributeValues: { ':pk': `GAME#${code}`, ':p': ORDER_SK_PREFIX },
      ConsistentRead: true,
    }),
  );
  return (res.Items ?? []) as OrderItem[];
}

/** Store the callback id the API uses to wake the clock early. */
export async function setClockCallbackId(code: string, callbackId: string): Promise<void> {
  await getDocClient().send(
    new UpdateCommand({
      TableName: tableName(),
      Key: gameKey(code),
      UpdateExpression: 'SET clockCallbackId = :c',
      ExpressionAttributeValues: { ':c': callbackId },
    }),
  );
}
