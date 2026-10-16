import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { Api } from './api.ts';
import { Clock } from './clock.ts';
import { Data } from './data.ts';
import { Realtime } from './realtime.ts';
import { Runner } from './runner.ts';
import { REPO_ROOT } from './bundling.ts';
import { Web } from './web.ts';
import { join } from 'node:path';

export interface SharpingCodeStackProps extends StackProps {
  /** Built frontend. Default: packages/web/dist. */
  webDistDir?: string;
}

/** Vite dev servers (see .claude/launch.json) keep working against the deployed API. */
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5175'];

export class SharpingCodeStack extends Stack {
  constructor(scope: Construct, id: string, props: SharpingCodeStackProps = {}) {
    super(scope, id, props);

    const web = new Web(this, 'Web', { distDir: props.webDistDir ?? join(REPO_ROOT, 'packages', 'web', 'dist') });
    const data = new Data(this, 'Data');
    const realtime = new Realtime(this, 'Realtime');
    const runner = new Runner(this, 'Runner');
    const clock = new Clock(this, 'Clock', { table: data.table, eventApi: realtime.api });
    const api = new Api(this, 'Api', {
      table: data.table,
      eventApi: realtime.api,
      runner: runner.fn,
      clockAlias: clock.alias,
      clockFunction: clock.fn,
      allowOrigins: [web.url, ...DEV_ORIGINS],
    });
    web.deploy({
      apiUrl: api.httpApi.apiEndpoint,
      eventsHttpDns: realtime.api.httpDns,
      eventsRealtimeDns: realtime.api.realtimeDns,
      eventsApiKey: realtime.apiKey,
    });

    new CfnOutput(this, 'HttpApiUrl', { value: api.httpApi.apiEndpoint });
    new CfnOutput(this, 'EventApiHttpDns', { value: realtime.api.httpDns });
    new CfnOutput(this, 'EventApiRealtimeDns', { value: realtime.api.realtimeDns });
    new CfnOutput(this, 'EventApiKey', { value: realtime.apiKey });
    new CfnOutput(this, 'TableName', { value: data.table.tableName });
  }
}
