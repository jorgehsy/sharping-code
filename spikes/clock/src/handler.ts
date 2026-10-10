import { createClockHandler } from './clock.js';
import { createAppSyncPublisher } from './publish.js';

export const handler = createClockHandler({
  publish: createAppSyncPublisher(process.env.HTTP_DOMAIN!, process.env.AWS_REGION!),
  waitMarginMs: Number(process.env.WAIT_MARGIN_MS ?? 1000),
});
