import * as cdk from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

export class ClockStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const { API_KEY, IAM } = appsync.AppSyncAuthorizationType;

    const api = new appsync.EventApi(this, 'EventApi', {
      apiName: 'clock-spike-events',
      authorizationConfig: {
        authProviders: [{ authorizationType: API_KEY }, { authorizationType: IAM }],
        connectionAuthModeTypes: [API_KEY],
        defaultPublishAuthModeTypes: [IAM],
        defaultSubscribeAuthModeTypes: [API_KEY],
      },
    });

    api.addChannelNamespace('game', {
      authorizationConfig: {
        publishAuthModeTypes: [IAM],
        subscribeAuthModeTypes: [API_KEY],
      },
    });

    const logGroup = new logs.LogGroup(this, 'ClockLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const clock = new lambda.Function(this, 'Clock', {
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('dist'), // built by `npm run build:lambda` (esbuild -> dist/index.mjs)
      memorySize: 256,
      timeout: cdk.Duration.seconds(30), // per-invocation limit; the whole execution is bounded by durableConfig
      logGroup,
      durableConfig: {
        executionTimeout: cdk.Duration.minutes(20),
        retentionPeriod: cdk.Duration.days(1),
      },
      environment: {
        HTTP_DOMAIN: api.httpDns,
        WAIT_MARGIN_MS: '1000',
      },
    });

    // appsync:EventPublish on the API's channel namespaces
    api.grantPublish(clock);

    const alias = new lambda.Alias(this, 'ClockLive', {
      aliasName: 'live',
      version: clock.currentVersion,
    });

    new cdk.CfnOutput(this, 'ApiKey', { value: api.apiKeys['Default'].attrApiKey });
    new cdk.CfnOutput(this, 'HttpDns', { value: api.httpDns });
    new cdk.CfnOutput(this, 'RealtimeDns', { value: api.realtimeDns });
    new cdk.CfnOutput(this, 'ClockQualifiedArn', { value: alias.functionArn });
  }
}
