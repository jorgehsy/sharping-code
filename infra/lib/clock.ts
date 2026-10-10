import { Duration } from 'aws-cdk-lib';
import type { EventApi } from 'aws-cdk-lib/aws-appsync';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Alias, type Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { bundledFunction } from './bundling.ts';

export interface ClockProps {
  table: ITable;
  eventApi: EventApi;
}

/** Game clock: one Lambda durable execution per game (ADR 0002). Invoked via the `live` alias. */
export class Clock extends Construct {
  readonly fn: LambdaFunction;
  /** Durable functions require a qualified ARN to be invoked. */
  readonly alias: Alias;

  constructor(scope: Construct, id: string, props: ClockProps) {
    super(scope, id);
    this.fn = bundledFunction(this, 'Function', {
      pkg: 'clock',
      memorySize: 256,
      timeout: Duration.seconds(30), // per invocation; the whole execution is bounded by durableConfig
      durableConfig: {
        executionTimeout: Duration.minutes(20),
        retentionPeriod: Duration.days(1),
      },
      environment: {
        TABLE_NAME: props.table.tableName,
        HTTP_DOMAIN: props.eventApi.httpDns,
        WAIT_MARGIN_MS: '5000', // long durable waits resume ~2-3 s late and cold; wake early, sleep the rest in-step
      },
    });
    props.table.grantReadWriteData(this.fn);
    props.eventApi.grantPublish(this.fn);

    this.alias = new Alias(this, 'Live', { aliasName: 'live', version: this.fn.currentVersion });
  }
}
