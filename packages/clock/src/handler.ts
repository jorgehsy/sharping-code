import {
  emit,
  listPlayers,
  orderKey,
  putOrderIfAbsent,
  setGameStatus,
  ttlFor,
  type EmitInput,
} from '@sharping/platform';
import { createClockHandler } from './clock.ts';
import { computeResults, type ClockAction, type PlannedOrder, type PlannedTick } from './schedule.ts';

// NOTE (infra): bundle with esbuild --format=esm and this exact banner, otherwise AWS SDK CJS deps
// fail with "Dynamic require" or a duplicate `createRequire` declaration:
//   import{createRequire as __cr}from'module';const require=__cr(import.meta.url);

async function putOrder(code: string, o: PlannedOrder): Promise<void> {
  await putOrderIfAbsent({
    ...orderKey(code, o.orderId),
    orderId: o.orderId,
    puzzleId: o.puzzleId,
    title: o.title,
    difficulty: o.difficulty,
    basePoints: o.basePoints,
    openedAt: o.openedAt,
    expiresAt: o.expiresAt,
    deliveries: 0,
    ttl: ttlFor(o.openedAt),
  });
}

/** Runs one tick: persist what must exist before clients can see it, then publish all events in one go (gapless seq). */
async function fire(code: string, tick: PlannedTick): Promise<void> {
  const events: EmitInput[] = [];
  const finish = tick.actions.some((a) => a.kind === 'finish');
  if (finish) await setGameStatus(code, 'finished');

  await Promise.all(tick.actions.map((a) => (a.kind === 'open' ? putOrder(code, a.order) : undefined)));
  for (const a of tick.actions) events.push(...(await toEvents(code, a)));
  await emit(code, events);
}

async function toEvents(code: string, a: ClockAction): Promise<EmitInput[]> {
  switch (a.kind) {
    case 'expire':
      return [{ type: 'order.expired', data: { orderId: a.orderId } }];
    case 'open': {
      const { orderId, title, difficulty, basePoints, expiresAt } = a.order;
      return [{ type: 'order.opened', data: { orderId, title, difficulty, basePoints, expiresAt } }];
    }
    case 'rush':
      return [{ type: 'rush.started', data: {} }];
    case 'finish': {
      const { podium, scores } = computeResults(await listPlayers(code));
      // TODO(awards): funny awards (award id -> playerId); empty for now.
      return [{ type: 'game.finished', data: { podium, awards: {}, scores } }];
    }
  }
}

export const handler = createClockHandler({
  fire,
  waitMarginMs: Number(process.env.WAIT_MARGIN_MS ?? 5000),
});
