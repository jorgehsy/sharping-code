import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { EventPayloads, EventType, GameEvent } from '@sharping/shared';
import { gameKey, getDocClient, tableName } from './table.ts';
import { publish } from './publish.ts';

export type EmitInput = { [T in EventType]: { type: T; data: EventPayloads[T] } }[EventType];

/** Pure: build envelopes for seq numbers `lastSeq - n + 1 .. lastSeq`. */
export function buildEnvelopes(events: readonly EmitInput[], lastSeq: number, at: number): GameEvent[] {
  const first = lastSeq - events.length + 1;
  return events.map((e, i) => ({ type: e.type, seq: first + i, at, data: e.data }) as GameEvent);
}

/** Atomically reserve `n` consecutive seq numbers on META; returns the last one reserved. */
export async function reserveSeq(code: string, n: number): Promise<number> {
  const res = await getDocClient().send(
    new UpdateCommand({
      TableName: tableName(),
      Key: gameKey(code),
      UpdateExpression: 'ADD seq :n',
      ExpressionAttributeValues: { ':n': n },
      ReturnValues: 'UPDATED_NEW',
    }),
  );
  return res.Attributes!.seq as number;
}

/** Reserve seq numbers, build envelopes (`at = Date.now()`), publish, and return them. */
export async function emit(code: string, events: EmitInput[]): Promise<GameEvent[]> {
  if (events.length === 0) return [];
  const lastSeq = await reserveSeq(code, events.length);
  const envelopes = buildEnvelopes(events, lastSeq, Date.now());
  await publish(code, envelopes);
  return envelopes;
}
