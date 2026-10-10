import { Duration } from 'aws-cdk-lib';
import type { Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda';
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { bundledFunction } from './bundling.ts';

/** Executes player code. Role = logs only; no VPC (zero idle cost, accepted egress). */
export class Runner extends Construct {
  readonly fn: LambdaFunction;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    const role = new Role(this, 'Role', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')],
    });
    this.fn = bundledFunction(this, 'Function', {
      pkg: 'runner',
      memorySize: 1024,
      timeout: Duration.seconds(5),
      role,
    });
  }
}
