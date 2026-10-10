import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { Api } from './api.ts';
import { Clock } from './clock.ts';
import { Data } from './data.ts';
import { Realtime } from './realtime.ts';
import { Runner } from './runner.ts';

// TODO(frontend): S3 + CloudFront hosting (framework still undecided). Then restrict API CORS to its domain.
export class SharpingCodeStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const data = new Data(this, 'Data');
    const realtime = new Realtime(this, 'Realtime');
    const runner = new Runner(this, 'Runner');
    const clock = new Clock(this, 'Clock', { table: data.table, eventApi: realtime.api });
    const api = new Api(this, 'Api', {
      table: data.table,
      eventApi: realtime.api,
      runner: runner.fn,
      clockAlias: clock.alias,
    });

    new CfnOutput(this, 'HttpApiUrl', { value: api.httpApi.apiEndpoint });
    new CfnOutput(this, 'EventApiHttpDns', { value: realtime.api.httpDns });
    new CfnOutput(this, 'EventApiRealtimeDns', { value: realtime.api.realtimeDns });
    new CfnOutput(this, 'EventApiKey', { value: realtime.apiKey });
    new CfnOutput(this, 'TableName', { value: data.table.tableName });
  }
}
