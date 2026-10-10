import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { ctx, fakeDeps, PUZZLE, v2Event } from './helpers.ts';

let deps: ReturnType<typeof fakeDeps>;
const call = async (method: string, path: string, opts?: { body?: unknown; token?: string }) => {
  const res = (await createApp(deps).resolve(v2Event(method, path, opts), ctx)) as {
    statusCode: number;
    body?: string;
  };
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : undefined };
};

beforeEach(() => {
  deps = fakeDeps();
});

describe('POST /games', () => {
  it('creates a game and returns credentials', async () => {
    deps.repo.createGame.mockResolvedValue({ code: 'ABCDE', playerId: 'p1', playerToken: 't1' });
    const res = await call('POST', '/games', { body: { nickname: ' Ana ' } });
    expect(res.status).toBe(201);
    expect(res.json).toEqual({ code: 'ABCDE', playerId: 'p1', playerToken: 't1' });
    expect(deps.repo.createGame).toHaveBeenCalledWith('Ana', 1_000_000);
  });

  it('rejects an invalid body', async () => {
    const res = await call('POST', '/games', { body: { nickname: '' } });
    expect(res.status).toBe(422);
    expect(deps.repo.createGame).not.toHaveBeenCalled();
  });
});

describe('POST /games/:code/players', () => {
  it('joins a running game and emits player.joined', async () => {
    deps.repo.getMeta.mockResolvedValue({ status: 'running' });
    deps.repo.addPlayer.mockResolvedValue({ playerId: 'p2', playerToken: 't2' });
    const res = await call('POST', '/games/abcde/players', { body: { nickname: 'Bob' } });
    expect(res.status).toBe(201);
    expect(res.json).toEqual({ playerId: 'p2', playerToken: 't2' });
    expect(deps.repo.getMeta).toHaveBeenCalledWith('ABCDE');
    expect(deps.emit).toHaveBeenCalledWith('ABCDE', [
      { type: 'player.joined', data: { playerId: 'p2', nickname: 'Bob' } },
    ]);
  });

  it('404 when the game does not exist', async () => {
    deps.repo.getMeta.mockResolvedValue(undefined);
    const res = await call('POST', '/games/ABCDE/players', { body: { nickname: 'Bob' } });
    expect(res.status).toBe(404);
    expect(deps.emit).not.toHaveBeenCalled();
  });

  it('409 when the game is finished', async () => {
    deps.repo.getMeta.mockResolvedValue({ status: 'finished' });
    const res = await call('POST', '/games/ABCDE/players', { body: { nickname: 'Bob' } });
    expect(res.status).toBe(409);
    expect(deps.repo.addPlayer).not.toHaveBeenCalled();
  });

  it('409 when the game finishes between check and write', async () => {
    deps.repo.getMeta.mockResolvedValue({ status: 'running' });
    deps.repo.addPlayer.mockResolvedValue(undefined);
    const res = await call('POST', '/games/ABCDE/players', { body: { nickname: 'Bob' } });
    expect(res.status).toBe(409);
    expect(deps.emit).not.toHaveBeenCalled();
  });
});

describe('POST /games/:code/start', () => {
  const timings = { startedAt: 1_000_000, rushAt: 1_720_000, endsAt: 1_900_000 };

  it('403 for a non-host', async () => {
    deps.repo.playerIdForToken.mockResolvedValue('p2');
    deps.repo.getMeta.mockResolvedValue({ status: 'lobby', hostPlayerId: 'p1' });
    const res = await call('POST', '/games/ABCDE/start', { token: 't2' });
    expect(res.status).toBe(403);
    expect(deps.repo.startGame).not.toHaveBeenCalled();
  });

  it('409 if already started', async () => {
    deps.repo.playerIdForToken.mockResolvedValue('p1');
    deps.repo.getMeta.mockResolvedValue({ status: 'running', hostPlayerId: 'p1' });
    deps.repo.startGame.mockResolvedValue(undefined);
    const res = await call('POST', '/games/ABCDE/start', { token: 't1' });
    expect(res.status).toBe(409);
    expect(deps.lambdas.startClock).not.toHaveBeenCalled();
  });

  it('204: emits game.started, starts the clock, warms the runner', async () => {
    deps.repo.playerIdForToken.mockResolvedValue('p1');
    deps.repo.getMeta.mockResolvedValue({ status: 'lobby', hostPlayerId: 'p1' });
    deps.repo.startGame.mockResolvedValue(timings);
    const res = await call('POST', '/games/ABCDE/start', { token: 't1' });
    expect(res.status).toBe(204);
    expect(deps.emit).toHaveBeenCalledWith('ABCDE', [{ type: 'game.started', data: timings }]);
    expect(deps.lambdas.startClock).toHaveBeenCalledWith({ gameCode: 'ABCDE', ...timings });
    expect(deps.lambdas.warmRunner).toHaveBeenCalledOnce();
  });
});

describe('GET /games/:code', () => {
  it('returns the snapshot with my player state', async () => {
    deps.repo.playerIdForToken.mockResolvedValue('p1');
    deps.repo.getSnapshot.mockResolvedValue({
      meta: { status: 'lobby', hostPlayerId: 'p1', createdAt: 5, seq: 7 },
      players: [{ playerId: 'p1', nickname: 'Ana', score: 0, condiments: 0 }],
      orders: [],
    });
    const res = await call('GET', '/games/ABCDE', { token: 't1' });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      code: 'ABCDE',
      status: 'lobby',
      orders: [],
      seq: 7,
      players: [{ playerId: 'p1', nickname: 'Ana', score: 0 }],
      me: { playerId: 'p1', condiments: 0, sabotage: null },
    });
  });
});

describe('auth', () => {
  it('401 without token', async () => {
    const res = await call('GET', '/games/ABCDE');
    expect(res.status).toBe(401);
    expect(deps.repo.playerIdForToken).not.toHaveBeenCalled();
  });

  it('401 with unknown token', async () => {
    deps.repo.playerIdForToken.mockResolvedValue(undefined);
    const res = await call('POST', '/games/ABCDE/start', { token: 'nope' });
    expect(res.status).toBe(401);
  });
});


const NOW = 1_000_000;
const order = (o: object = {}) => ({
  orderId: 'o1', puzzleId: 'pz', title: 'Puzzle', difficulty: 'hard', basePoints: 400,
  openedAt: NOW - 1000, expiresAt: NOW + 60_000, deliveries: 0, ...o,
});
const meta = (m: object = {}) => ({ status: 'running', hostPlayerId: 'p1', startedAt: NOW - 1000, rushAt: NOW + 100_000, endsAt: NOW + 200_000, ...m });
const player = (p: object = {}) => ({ playerId: 'p1', nickname: 'Ana', score: 0, condiments: 0, currentOrderId: 'o1', ...p });
const login = (id = 'p1') => deps.repo.playerIdForToken.mockResolvedValue(id);

describe('GET /games/:code orders', () => {
  it('returns only open orders, sorted, and hides an expired current order', async () => {
    login();
    deps.repo.getSnapshot.mockResolvedValue({
      meta: meta(),
      players: [player({ currentOrderId: 'old' })],
      orders: [order({ orderId: 'b', openedAt: 5 }), order({ orderId: 'old', expiresAt: NOW }), order({ orderId: 'a', openedAt: 1 })],
    });
    const res = await call('GET', '/games/ABCDE', { token: 't' });
    expect(res.json.orders.map((o: { orderId: string }) => o.orderId)).toEqual(['a', 'b']);
    expect(res.json.orders[0]).not.toHaveProperty('puzzleId');
    expect(res.json.me.currentOrderId).toBeNull();
  });
});

describe('POST take', () => {
  const take = () => call('POST', '/games/ABCDE/orders/o1/take', { token: 't' });
  beforeEach(() => {
    login();
    deps.repo.getMeta.mockResolvedValue(meta());
    deps.repo.getOrder.mockResolvedValue(order());
    deps.repo.getPlayer.mockResolvedValue(player({ currentOrderId: undefined }));
  });

  it('returns statement, signature and public cases only; emits order.taken', async () => {
    const res = await take();
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ orderId: 'o1', statement: 'Do it.', signature: PUZZLE.signature, publicCases: PUZZLE.cases.public });
    expect(JSON.stringify(res.json)).not.toContain('198');
    expect(deps.repo.setCurrentOrder).toHaveBeenCalledWith('ABCDE', 'p1', 'o1');
    expect(deps.emit).toHaveBeenCalledWith('ABCDE', [{ type: 'order.taken', data: { orderId: 'o1', playerId: 'p1' } }]);
  });

  it('is idempotent when already cooking it (no event)', async () => {
    deps.repo.getPlayer.mockResolvedValue(player());
    expect((await take()).status).toBe(200);
    expect(deps.emit).not.toHaveBeenCalled();
  });

  it('404 unknown order, 409 expired, 409 not running', async () => {
    deps.repo.getOrder.mockResolvedValueOnce(undefined);
    expect((await take()).status).toBe(404);
    deps.repo.getOrder.mockResolvedValueOnce(order({ expiresAt: NOW }));
    expect((await take()).status).toBe(409);
    deps.repo.getMeta.mockResolvedValueOnce(meta({ status: 'lobby' }));
    expect((await take()).status).toBe(409);
    deps.repo.getMeta.mockResolvedValueOnce(meta({ endsAt: NOW }));
    expect((await take()).status).toBe(409);
  });
});

describe('POST submit', () => {
  const submit = () => call('POST', '/games/ABCDE/orders/o1/submit', { token: 't', body: { source: 'x' } });
  beforeEach(() => {
    login();
    deps.repo.getMeta.mockResolvedValue(meta());
    deps.repo.getOrder.mockResolvedValue(order());
    deps.repo.getPlayer.mockResolvedValue(player());
    deps.repo.claimDelivery.mockResolvedValue({ ok: true, rank: 1 });
    deps.repo.applyDelivery.mockResolvedValue({ clearedSabotage: false, condimentEarned: true });
    deps.repo.getScores.mockResolvedValue({ p1: 400 });
  });

  it('sends public + hidden cases and the sabotage to the runner', async () => {
    deps.repo.getPlayer.mockResolvedValue(player({ sabotage: 'no-loops' }));
    await submit();
    expect(deps.lambdas.runCode).toHaveBeenCalledWith({
      source: 'x',
      entry: 'solve',
      cases: [{ input: [1], output: 2 }, { input: [99], output: 198, hidden: true }],
      sabotage: 'no-loops',
    });
  });

  it('1st hard delivery: full points, condiment, events in order', async () => {
    const res = await submit();
    expect(res.json).toEqual({ passed: true, rank: 1, points: 400, scores: { p1: 400 } });
    expect(deps.repo.claimDelivery).toHaveBeenCalledWith('ABCDE', 'o1', 'p1', NOW, 3);
    expect(deps.repo.applyDelivery).toHaveBeenCalledWith('ABCDE', 'p1', { points: 400, condiment: true, now: NOW });
    expect(deps.emit).toHaveBeenCalledWith('ABCDE', [
      { type: 'order.delivered', data: { orderId: 'o1', playerId: 'p1', rank: 1, points: 400, scores: { p1: 400 } } },
      { type: 'condiment.earned', data: { playerId: 'p1' } },
    ]);
  });

  it('rush hour doubles, rank 2 pays 60%, sabotage cleared event', async () => {
    deps.repo.getMeta.mockResolvedValue(meta({ rushAt: NOW - 1 }));
    deps.repo.claimDelivery.mockResolvedValue({ ok: true, rank: 2 });
    deps.repo.applyDelivery.mockResolvedValue({ clearedSabotage: true, condimentEarned: false });
    const res = await submit();
    expect(res.json.points).toBe(480);
    const events = (deps.emit.mock.calls[0] as unknown as [string, { type: string }[]])[1];
    expect(events.map((e) => e.type)).toEqual(['order.delivered', 'sabotage.cleared']);
  });

  it('4th+ correct delivery: 200 passed, rank 4, 0 points, no order.delivered, sabotage still cleared', async () => {
    deps.repo.claimDelivery.mockResolvedValue({ ok: false, reason: 'full' });
    deps.repo.applyDelivery.mockResolvedValue({ clearedSabotage: true, condimentEarned: false });
    const res = await submit();
    expect(res.json).toMatchObject({ passed: true, rank: 4, points: 0 });
    expect(deps.repo.applyDelivery).toHaveBeenCalledWith('ABCDE', 'p1', { points: 0, condiment: false, now: NOW });
    const events = (deps.emit.mock.calls[0] as unknown as [string, { type: string }[]])[1];
    expect(events.map((e) => e.type)).toEqual(['sabotage.cleared']);
  });

  it('409 when the claim says expired or duplicate', async () => {
    deps.repo.claimDelivery.mockResolvedValueOnce({ ok: false, reason: 'expired' });
    expect((await submit()).status).toBe(409);
    deps.repo.claimDelivery.mockResolvedValueOnce({ ok: false, reason: 'duplicate' });
    expect((await submit()).status).toBe(409);
    expect(deps.repo.applyDelivery).not.toHaveBeenCalled();
  });

  it('failing a public case: penalty, dish.burned, case returned', async () => {
    const failed = { passed: false, reason: 'wrong', case: { input: [1], expected: 2, actual: 3 }, durationMs: 4 };
    deps.lambdas.runCode.mockResolvedValue(failed as never);
    deps.repo.getScores.mockResolvedValue({ p1: -10 });
    const res = await submit();
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ...failed, penalty: 10, scores: { p1: -10 } });
    expect(deps.repo.applyPenalty).toHaveBeenCalledWith('ABCDE', 'p1', 10, NOW);
    expect(deps.emit).toHaveBeenCalledWith('ABCDE', [
      { type: 'dish.burned', data: { playerId: 'p1', orderId: 'o1', penalty: 10, scores: { p1: -10 } } },
    ]);
    expect(deps.repo.claimDelivery).not.toHaveBeenCalled();
  });

  it('failing a hidden case never leaks case data', async () => {
    deps.lambdas.runCode.mockResolvedValue({
      passed: false, reason: 'wrong', hidden: true, case: { input: [99], expected: 198, actual: 0 }, durationMs: 4,
    } as never);
    const res = await submit();
    expect(res.json).toMatchObject({ passed: false, hidden: true, penalty: 10 });
    expect(JSON.stringify(res.json)).not.toContain('198');
    expect(res.json).not.toHaveProperty('case');
  });

  it('409 if the order was not taken, already delivered, expired or the game is over; 404 unknown', async () => {
    deps.repo.getPlayer.mockResolvedValueOnce(player({ currentOrderId: 'o2' }));
    expect((await submit()).status).toBe(409);
    deps.repo.getOrder.mockResolvedValueOnce(order({ deliveredBy: new Set(['p1']) }));
    expect((await submit()).status).toBe(409);
    deps.repo.getOrder.mockResolvedValueOnce(order({ expiresAt: NOW }));
    expect((await submit()).status).toBe(409);
    deps.repo.getMeta.mockResolvedValueOnce(meta({ status: 'finished' }));
    expect((await submit()).status).toBe(409);
    deps.repo.getOrder.mockResolvedValueOnce(undefined);
    expect((await submit()).status).toBe(404);
    expect(deps.lambdas.runCode).not.toHaveBeenCalled();
  });
});

describe('POST taste', () => {
  const taste = () => call('POST', '/games/ABCDE/orders/o1/taste', { token: 't', body: { source: 'x' } });
  const tasted = { ok: true, cases: [{ input: [1], expected: 2, actual: 2, passed: true }], durationMs: 1 };
  beforeEach(() => {
    login();
    deps.repo.getMeta.mockResolvedValue(meta());
    deps.repo.getOrder.mockResolvedValue(order());
    deps.repo.getPlayer.mockResolvedValue(player());
    deps.lambdas.runCode.mockResolvedValue(tasted as never);
  });

  it('sends public cases only, taste mode and the sabotage; returns the runner result untouched', async () => {
    deps.repo.getPlayer.mockResolvedValue(player({ sabotage: 'no-loops' }));
    const res = await taste();
    expect(res.status).toBe(200);
    expect(res.json).toEqual(tasted);
    expect(deps.lambdas.runCode).toHaveBeenCalledWith({
      source: 'x',
      entry: 'solve',
      cases: [{ input: [1], output: 2 }],
      mode: 'taste',
      sabotage: 'no-loops',
    });
  });

  it('is free: no penalty, delivery, events or score change', async () => {
    deps.lambdas.runCode.mockResolvedValue({ ok: false, reason: 'compile', message: 'bad', durationMs: 1 } as never);
    const res = await taste();
    expect(res.status).toBe(200);
    expect(deps.repo.applyPenalty).not.toHaveBeenCalled();
    expect(deps.repo.claimDelivery).not.toHaveBeenCalled();
    expect(deps.repo.applyDelivery).not.toHaveBeenCalled();
    expect(deps.emit).not.toHaveBeenCalled();
  });

  it('409 if not taken, expired or game over; 404 unknown; 401 without token', async () => {
    deps.repo.getPlayer.mockResolvedValueOnce(player({ currentOrderId: 'o2' }));
    expect((await taste()).status).toBe(409);
    deps.repo.getOrder.mockResolvedValueOnce(order({ expiresAt: NOW }));
    expect((await taste()).status).toBe(409);
    deps.repo.getMeta.mockResolvedValueOnce(meta({ status: 'finished' }));
    expect((await taste()).status).toBe(409);
    deps.repo.getOrder.mockResolvedValueOnce(undefined);
    expect((await taste()).status).toBe(404);
    expect((await call('POST', '/games/ABCDE/orders/o1/taste', { body: { source: 'x' } })).status).toBe(401);
    expect(deps.lambdas.runCode).not.toHaveBeenCalled();
  });
});

describe('POST sabotages', () => {
  const sabotage = (target = 'p2') => call('POST', '/games/ABCDE/sabotages', { token: 't', body: { targetPlayerId: target } });
  beforeEach(() => {
    login();
    deps.repo.getMeta.mockResolvedValue(meta());
    deps.repo.getPlayer.mockImplementation(async (_c: string, id: string) =>
      id === 'p1' ? player({ condiments: 1 }) : id === 'p2' ? player({ playerId: 'p2', currentOrderId: undefined }) : undefined,
    );
  });

  it('204: sticks a rule and emits sabotage.applied', async () => {
    const res = await sabotage();
    expect(res.status).toBe(204);
    expect(deps.repo.stickSabotage).toHaveBeenCalledWith('ABCDE', 'p1', 'p2', 'no-loops');
    expect(deps.emit).toHaveBeenCalledWith('ABCDE', [
      { type: 'sabotage.applied', data: { fromPlayerId: 'p1', toPlayerId: 'p2', rule: 'no-loops' } },
    ]);
  });

  it('respects blockedSabotages of what the target is cooking', async () => {
    deps.repo.getPlayer.mockImplementation(async (_c: string, id: string) =>
      id === 'p1' ? player({ condiments: 1 }) : player({ playerId: 'p2', currentOrderId: 'o1' }),
    );
    deps.repo.getOrder.mockResolvedValue(order());
    deps.getPuzzle.mockReturnValue({ ...PUZZLE, blockedSabotages: ['no-loops'] });
    await sabotage();
    expect(deps.repo.stickSabotage).toHaveBeenCalledWith('ABCDE', 'p1', 'p2', 'max-lines-3');

    deps.getPuzzle.mockReturnValue({ ...PUZZLE, blockedSabotages: ['no-loops', 'max-lines-3'] });
    const res = await sabotage();
    expect(res.status).toBe(409);
    expect(res.json.message).toMatch(/applies/);
  });

  it('409 with a clear message: self, no condiment, already sabotaged', async () => {
    expect((await sabotage('p1')).json.message).toBe('you cannot sabotage yourself');
    deps.repo.getPlayer.mockImplementation(async (_c: string, id: string) => (id === 'p1' ? player() : player({ playerId: 'p2' })));
    expect((await sabotage()).json.message).toBe('you have no condiments');
    deps.repo.getPlayer.mockImplementation(async (_c: string, id: string) =>
      id === 'p1' ? player({ condiments: 1 }) : player({ playerId: 'p2', sabotage: 'no-loops' }),
    );
    expect((await sabotage()).json.message).toBe('that player is already sabotaged');
    expect(deps.repo.stickSabotage).not.toHaveBeenCalled();
  });

  it('409 when the transaction loses a race', async () => {
    deps.repo.stickSabotage.mockResolvedValue(false);
    const res = await sabotage();
    expect(res.status).toBe(409);
    expect(deps.emit).not.toHaveBeenCalled();
  });

  it('404 unknown target, 409 game not running', async () => {
    expect((await sabotage('nobody')).status).toBe(404);
    deps.repo.getMeta.mockResolvedValue(meta({ status: 'finished' }));
    expect((await sabotage()).status).toBe(409);
  });
});
