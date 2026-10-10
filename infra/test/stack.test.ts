import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { SharpingCodeStack } from '../lib/stack.ts';

let template: Template;
beforeAll(() => {
  template = Template.fromStack(new SharpingCodeStack(new App(), 'Test'));
}, 120_000);

describe('SharpingCodeStack', () => {
  it('has a TTL-enabled on-demand table', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
    });
  });

  it('runs all app functions on arm64 / nodejs24', () => {
    const fns = template.findResources('AWS::Lambda::Function', { Properties: { Runtime: 'nodejs24.x' } });
    // runner, clock, api (CDK helper functions, if any, are not nodejs24).
    expect(Object.keys(fns)).toHaveLength(3);
    for (const f of Object.values(fns)) expect((f as any).Properties.Architectures).toEqual(['arm64']);
  });

  it('configures the clock as a durable function with a live alias', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      DurableConfig: Match.objectLike({ ExecutionTimeout: 1200 }),
    });
    template.hasResourceProperties('AWS::Lambda::Alias', { Name: 'live' });
  });

  it('exposes 7 HTTP API routes plus a CORS config', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Route', 7);
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: Match.objectLike({ AllowHeaders: Match.arrayWith(['x-player-token']) }),
    });
  });

  it('declares the outputs', () => {
    for (const o of ['HttpApiUrl', 'EventApiHttpDns', 'EventApiRealtimeDns', 'EventApiKey', 'TableName']) {
      expect(template.toJSON().Outputs).toHaveProperty(o);
    }
  });
});
