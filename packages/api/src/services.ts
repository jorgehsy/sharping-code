import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import type { ClockInput, RunnerEvent, RunnerResult } from '@sharping/shared';

/** Side-effect ports of the lambdalith toward other Lambdas. */
export interface Lambdas {
  /** Start the durable game clock (async invoke, qualified ARN, execution name = game code). */
  startClock(input: ClockInput): Promise<void>;
  /** Run player code in the Runner Lambda (sync invoke). Throws if the runner itself fails (not the player's code). */
  runCode(event: RunnerEvent): Promise<RunnerResult>;
  /** Fire-and-forget warm-up of the runner. Never throws. */
  warmRunner(): Promise<void>;
}

export function createLambdas(client: LambdaClient, env: { clockArn: string; runnerName: string }): Lambdas {
  return {
    async startClock(input) {
      await client.send(
        new InvokeCommand({
          FunctionName: env.clockArn, // must be qualified (alias): durable functions reject unqualified ids
          InvocationType: 'Event',
          DurableExecutionName: input.gameCode, // idempotent per game
          Payload: JSON.stringify(input),
        }),
      );
    },
    async runCode(event) {
      const res = await client.send(
        new InvokeCommand({
          FunctionName: env.runnerName,
          InvocationType: 'RequestResponse',
          Payload: JSON.stringify(event),
        }),
      );
      const text = res.Payload ? new TextDecoder().decode(res.Payload) : '';
      if (res.FunctionError) throw new Error(`runner failed (${res.FunctionError}): ${text.slice(0, 300)}`);
      return JSON.parse(text) as RunnerResult;
    },
    async warmRunner() {
      try {
        await client.send(
          new InvokeCommand({
            FunctionName: env.runnerName,
            InvocationType: 'Event',
            Payload: JSON.stringify({ warmup: true }),
          }),
        );
      } catch {
        // Warm-up is best effort.
      }
    },
  };
}
