import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { SharpingCodeStack } from '../lib/stack.ts';

let template: Template;
beforeAll(() => {
  // A stand-in build: CI does not build the frontend.
  const webDistDir = mkdtempSync(join(tmpdir(), 'web-dist-'));
  writeFileSync(join(webDistDir, 'index.html'), '<!doctype html>');
  template = Template.fromStack(new SharpingCodeStack(new App(), 'Test', { webDistDir }));
}, 120_000);

describe('SharpingCodeStack', () => {
  it('has a TTL-enabled on-demand table', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
    });
  });

  it('runs all app functions on arm64 / nodejs24', () => {
    const all = template.findResources('AWS::Lambda::Function');
    // runner, clock, api. CDK helpers (bucket auto-delete, deployment) have `Custom...` logical ids.
    const fns = Object.fromEntries(Object.entries(all).filter(([id]) => !id.startsWith('Custom')));
    expect(Object.keys(fns)).toHaveLength(3);
    for (const f of Object.values(fns)) {
      expect((f as any).Properties.Runtime).toBe('nodejs24.x');
      expect((f as any).Properties.Architectures).toEqual(['arm64']);
    }
  });

  it('configures the clock as a durable function with a live alias', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      DurableConfig: Match.objectLike({ ExecutionTimeout: 1200 }),
    });
    template.hasResourceProperties('AWS::Lambda::Alias', { Name: 'live' });
  });

  it('lets the API complete clock callbacks (qualified function ARN only)', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'lambda:SendDurableExecutionCallbackSuccess',
            Effect: 'Allow',
            Resource: { 'Fn::Join': ['', [Match.anyValue(), ':*']] },
          }),
        ]),
      },
    });
  });

  it('exposes 8 HTTP API routes plus a CORS config', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Route', 8);
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: Match.objectLike({ AllowHeaders: Match.arrayWith(['x-player-token']) }),
    });
  });

  it('declares the outputs', () => {
    for (const o of ['HttpApiUrl', 'EventApiHttpDns', 'EventApiRealtimeDns', 'EventApiKey', 'TableName']) {
      expect(template.toJSON().Outputs).toHaveProperty(o);
    }
  });

  it('hosts the frontend privately behind CloudFront and restricts API CORS to it', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
    });
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({ DefaultRootObject: 'index.html' }),
    });
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    const api = Object.values(template.findResources('AWS::ApiGatewayV2::Api'))[0] as any;
    const origins = api.Properties.CorsConfiguration.AllowOrigins;
    expect(origins).not.toContain('*');
    expect(origins).toContain('http://localhost:5173');
    expect(JSON.stringify(origins)).toContain('DomainName');
  });
});
