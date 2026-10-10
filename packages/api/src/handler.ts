import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { emit } from '@sharping/platform';
import type { Context } from 'aws-lambda';
import { createApp } from './app.ts';
import { repo } from './repo.ts';
import { createLambdas } from './services.ts';

// NOTE (infra): bundled as ESM with a createRequire banner (see infra/lib/bundling.ts).

const logger = new Logger();
const tracer = new Tracer();
const metrics = new Metrics();

const lambdaClient = tracer.captureAWSv3Client(new LambdaClient({}));

const app = createApp({
  repo,
  emit,
  lambdas: createLambdas(lambdaClient, {
    clockArn: process.env.CLOCK_FUNCTION_ARN ?? '',
    runnerName: process.env.RUNNER_FUNCTION_NAME ?? '',
  }),
  now: () => Date.now(),
  count: (name) => metrics.addMetric(name, MetricUnit.Count, 1),
  logger,
});

export const handler = async (event: unknown, context: Context) => {
  logger.addContext(context);
  try {
    return await app.resolve(event, context);
  } finally {
    metrics.publishStoredMetrics();
  }
};
