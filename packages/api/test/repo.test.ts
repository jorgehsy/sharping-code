import { TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { setDocClient } from '@sharping/platform';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateCode, repo } from '../src/repo.ts';

const send = vi.fn();
const cancelled = Object.assign(new Error('cancelled'), {
  name: 'TransactionCanceledException',
  CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }, { Code: 'None' }],
});

beforeEach(() => {
  process.env.TABLE_NAME = 'T';
  send.mockReset();
  setDocClient({ send } as never);
});
afterEach(() => setDocClient(undefined));

describe('generateCode', () => {
  it('is 5 uppercase chars without ambiguous ones', () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
  });
});

describe('createGame', () => {
  it('writes META, PLAYER and TOKEN in one transaction', async () => {
    send.mockResolvedValue({});
    const res = await repo.createGame('Ana', 1_000_000);
    expect(send).toHaveBeenCalledOnce();
    const cmd = send.mock.calls[0]![0] as TransactWriteCommand;
    expect(cmd).toBeInstanceOf(TransactWriteCommand);
    const items = cmd.input.TransactItems!.map((t) => t.Put!.Item!);
    expect(items.map((i) => i.sk)).toEqual(['META', `PLAYER#${res.playerId}`, `TOKEN#${res.playerToken}`]);
    expect(items[0]).toMatchObject({ pk: `GAME#${res.code}`, status: 'lobby', hostPlayerId: res.playerId, seq: 0 });
    expect(cmd.input.TransactItems![0]!.Put!.ConditionExpression).toBe('attribute_not_exists(pk)');
  });

  it('retries on code collision', async () => {
    send.mockRejectedValueOnce(cancelled).mockResolvedValueOnce({});
    await repo.createGame('Ana', 1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('propagates other errors', async () => {
    send.mockRejectedValue(new Error('boom'));
    await expect(repo.createGame('Ana', 1)).rejects.toThrow('boom');
  });
});

describe('startGame', () => {
  it('computes rush/end from the shared constants', async () => {
    send.mockResolvedValue({});
    const t = await repo.startGame('ABCDE', 1000);
    expect(t).toEqual({ startedAt: 1000, rushAt: 1000 + 12 * 60_000, endsAt: 1000 + 15 * 60_000 });
    expect((send.mock.calls[0]![0] as UpdateCommand).input.ConditionExpression).toBe('#s = :lobby');
  });

  it('returns undefined when not in lobby', async () => {
    send.mockRejectedValue(Object.assign(new Error('x'), { name: 'ConditionalCheckFailedException' }));
    expect(await repo.startGame('ABCDE', 1000)).toBeUndefined();
  });
});

describe('addPlayer', () => {
  it('returns undefined when the status condition fails', async () => {
    send.mockRejectedValue(cancelled);
    expect(await repo.addPlayer('ABCDE', 'Bob', 1)).toBeUndefined();
  });
});

const condFail = Object.assign(new Error('x'), { name: 'ConditionalCheckFailedException' });

describe('claimDelivery', () => {
  it('conditional increment: rank is the incremented value', async () => {
    send.mockResolvedValue({ Attributes: { deliveries: 2 } });
    expect(await repo.claimDelivery('ABCDE', 'o1', 'p1', 5000, 3)).toEqual({ ok: true, rank: 2 });
    const input = (send.mock.calls[0]![0] as UpdateCommand).input;
    expect(input.ConditionExpression).toContain('deliveries < :max');
    expect(input.ConditionExpression).toContain('expiresAt > :now');
    expect(input.ExpressionAttributeValues).toMatchObject({ ':max': 3, ':now': 5000, ':pid': 'p1' });
  });

  it.each([
    [{ Item: { expiresAt: 4000, deliveries: 1 } }, 'expired'],
    [{ Item: { expiresAt: 9000, deliveries: 1, deliveredBy: new Set(['p1']) } }, 'duplicate'],
    [{ Item: { expiresAt: 9000, deliveries: 3, deliveredBy: new Set(['a', 'b', 'c']) } }, 'full'],
    [{}, 'missing'],
  ])('explains a refused claim (%#)', async (readBack, reason) => {
    send.mockRejectedValueOnce(condFail).mockResolvedValueOnce(readBack);
    expect(await repo.claimDelivery('ABCDE', 'o1', 'p1', 5000, 3)).toEqual({ ok: false, reason });
  });
});

describe('applyDelivery', () => {
  it('adds points, clears the sabotage and reports it', async () => {
    send.mockResolvedValue({ Attributes: { sabotage: 'no-loops' } });
    expect(await repo.applyDelivery('ABCDE', 'p1', { points: 100, condiment: false, now: 1 })).toEqual({
      clearedSabotage: true,
      condimentEarned: false,
    });
    expect((send.mock.calls[0]![0] as UpdateCommand).input.UpdateExpression).toContain('REMOVE sabotage');
  });

  it('retries without the condiment when the cap was hit meanwhile', async () => {
    send.mockRejectedValueOnce(condFail).mockResolvedValueOnce({ Attributes: {} });
    expect(await repo.applyDelivery('ABCDE', 'p1', { points: 400, condiment: true, now: 1 })).toEqual({
      clearedSabotage: false,
      condimentEarned: false,
    });
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('stickSabotage', () => {
  it('one transaction: game running, attacker has a condiment, target not sabotaged', async () => {
    send.mockResolvedValue({});
    expect(await repo.stickSabotage('ABCDE', 'a', 'b', 'no-loops')).toBe(true);
    const items = (send.mock.calls[0]![0] as TransactWriteCommand).input.TransactItems!;
    expect(items[1]!.Update!.ConditionExpression).toBe('condiments >= :one');
    expect(items[2]!.Update!.ConditionExpression).toContain('attribute_not_exists(sabotage)');
  });

  it('false when a condition fails', async () => {
    send.mockRejectedValue(cancelled);
    expect(await repo.stickSabotage('ABCDE', 'a', 'b', 'no-loops')).toBe(false);
  });
});
