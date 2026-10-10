import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gameKey, playerKey, tokenKey, orderKey, ttlFor, setDocClient } from '../src/table.ts';
import { chunk } from '../src/publish.ts';
import { buildEnvelopes, emit } from '../src/events.ts';

describe('keys', () => {
  it('builds single-table keys', () => {
    expect(gameKey('AB')).toEqual({ pk: 'GAME#AB', sk: 'META' });
    expect(playerKey('AB', 'p1')).toEqual({ pk: 'GAME#AB', sk: 'PLAYER#p1' });
    expect(tokenKey('AB', 't')).toEqual({ pk: 'GAME#AB', sk: 'TOKEN#t' });
    expect(orderKey('AB', 'o1')).toEqual({ pk: 'GAME#AB', sk: 'ORDER#o1' });
  });
  it('ttl is 24h ahead in epoch seconds', () => {
    expect(ttlFor(1_000_000)).toBe(1000 + 86_400);
  });
});

describe('chunk', () => {
  it('splits into groups of max size', () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7], 5)).toEqual([[1, 2, 3, 4, 5], [6, 7]]);
    expect(chunk([], 5)).toEqual([]);
  });
});

describe('buildEnvelopes', () => {
  it('assigns consecutive seq ending at lastSeq', () => {
    const out = buildEnvelopes(
      [
        { type: 'rush.started', data: {} },
        { type: 'order.expired', data: { orderId: 'o1' } },
      ],
      10,
      99,
    );
    expect(out.map((e) => e.seq)).toEqual([9, 10]);
    expect(out.every((e) => e.at === 99)).toBe(true);
  });
});

describe('emit', () => {
  beforeEach(() => {
    process.env.TABLE_NAME = 'T';
    process.env.HTTP_DOMAIN = 'example.test';
    process.env.AWS_REGION = 'us-east-1';
  });

  it('reserves N seq with one ADD update and publishes in chunks of 5', async () => {
    const send = vi.fn().mockResolvedValue({ Attributes: { seq: 7 } });
    setDocClient({ send } as any);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    // Avoid real credential resolution.
    process.env.AWS_ACCESS_KEY_ID = 'AKIAFAKE';
    process.env.AWS_SECRET_ACCESS_KEY = 'fake';

    const events = Array.from({ length: 7 }, (_, i) => ({ type: 'order.expired' as const, data: { orderId: `o${i}` } }));
    const out = await emit('AB', events);

    expect(send).toHaveBeenCalledTimes(1);
    const input = send.mock.calls[0]![0].input;
    expect(input.UpdateExpression).toBe('ADD seq :n');
    expect(input.ExpressionAttributeValues).toEqual({ ':n': 7 });
    expect(input.ReturnValues).toBe('UPDATED_NEW');
    expect(out.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.channel).toBe('/game/AB');
    expect(body.events).toHaveLength(5);
    vi.unstubAllGlobals();
    setDocClient(undefined);
  });
});
