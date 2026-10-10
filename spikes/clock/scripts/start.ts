// Usage: tsx scripts/start.ts <gameCode> <qualifiedArn> [durationSec]
// Async (Event) invoke on the qualified ARN; durable execution name = gameCode (idempotent).
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const [gameCode, arn = process.env.CLOCK_ARN, dur = '180'] = process.argv.slice(2);
if (!gameCode || !arn) {
  console.error('usage: start.ts <gameCode> <qualifiedArn> [durationSec]');
  process.exit(1);
}
const region = arn.split(':')[3];
const res = await new LambdaClient({ region }).send(
  new InvokeCommand({
    FunctionName: arn,
    InvocationType: 'Event',
    DurableExecutionName: gameCode,
    Payload: JSON.stringify({ gameCode, durationSec: Number(dur) }),
  }),
);
console.log('status', res.StatusCode, 'startedAt', new Date().toISOString());
