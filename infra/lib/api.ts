import { Duration } from 'aws-cdk-lib';
import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { EventApi } from 'aws-cdk-lib/aws-appsync';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Tracing, type Function as LambdaFunction, type IAlias, type IFunction } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { bundledFunction } from './bundling.ts';

export interface ApiProps {
  table: ITable;
  eventApi: EventApi;
  runner: IFunction;
  clockAlias: IAlias;
  /** The clock function itself: callbacks are authorized against `<function arn>:*`. */
  clockFunction: IFunction;
  /** Browser origins allowed by CORS (the hosted frontend and local dev). */
  allowOrigins: string[];
}

/** Lambdalith behind an HTTP API (payload v2). Routes are dispatched by the Powertools Router. */
export class Api extends Construct {
  readonly fn: LambdaFunction;
  readonly httpApi: HttpApi;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    this.fn = bundledFunction(this, 'Function', {
      pkg: 'api',
      memorySize: 512,
      timeout: Duration.seconds(10),
      tracing: Tracing.ACTIVE,
      environment: {
        TABLE_NAME: props.table.tableName,
        HTTP_DOMAIN: props.eventApi.httpDns,
        CLOCK_FUNCTION_ARN: props.clockAlias.functionArn,
        RUNNER_FUNCTION_NAME: props.runner.functionName,
        POWERTOOLS_SERVICE_NAME: 'api',
        POWERTOOLS_METRICS_NAMESPACE: 'SharpingCode',
      },
      // The runtime-provided SDK may predate `DurableExecutionName`: bundle client-lambda.
      // The rest stays external (runtime SDK) to keep the bundle small.
      external: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb', '@aws-sdk/credential-provider-node'],
    });

    props.table.grantReadWriteData(this.fn);
    props.eventApi.grantPublish(this.fn);
    props.runner.grantInvoke(this.fn);
    // Durable functions only need lambda:InvokeFunction on the qualified ARN (alias).
    props.clockAlias.grantInvoke(this.fn);
    // 3rd delivery of an order: complete the clock's waitForCallback to refill the slot right away.
    this.fn.addToRolePolicy(
      new PolicyStatement({
        actions: ['lambda:SendDurableExecutionCallbackSuccess'],
        resources: [`${props.clockFunction.functionArn}:*`],
      }),
    );

    this.httpApi = new HttpApi(this, 'HttpApi', {
      apiName: 'sharping-code',
      corsPreflight: {
        allowOrigins: props.allowOrigins,
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.OPTIONS],
        allowHeaders: ['content-type', 'x-player-token'],
        maxAge: Duration.hours(1),
      },
    });

    const integration = new HttpLambdaIntegration('Lambdalith', this.fn);
    const routes: [HttpMethod, string][] = [
      [HttpMethod.POST, '/games'],
      [HttpMethod.POST, '/games/{code}/players'],
      [HttpMethod.GET, '/games/{code}'],
      [HttpMethod.POST, '/games/{code}/start'],
      [HttpMethod.POST, '/games/{code}/orders/{id}/take'],
      [HttpMethod.POST, '/games/{code}/orders/{id}/submit'],
      [HttpMethod.POST, '/games/{code}/orders/{id}/taste'],
      [HttpMethod.POST, '/games/{code}/sabotages'],
    ];
    for (const [method, path] of routes) this.httpApi.addRoutes({ path, methods: [method], integration });
  }
}
