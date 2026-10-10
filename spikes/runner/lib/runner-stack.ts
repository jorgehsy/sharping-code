import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";
import { fileURLToPath } from "node:url";

export class RunnerStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Basic execution only (logs). No VPC: zero idle cost; player code has egress but no creds/fs.
    const role = new Role(this, "RunnerRole", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
    });

    const fn = new NodejsFunction(this, "Runner", {
      entry: fileURLToPath(new URL("../src/handler.ts", import.meta.url)),
      handler: "handler",
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(5),
      memorySize: 1024,
      role,
      logGroup: new LogGroup(this, "RunnerLogs", { retention: RetentionDays.ONE_WEEK }),
      bundling: {
        minify: true,
        format: OutputFormat.ESM,
        target: "node24",
        mainFields: ["module", "main"],
        banner: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);",
      },
    });

    new CfnOutput(this, "FunctionName", { value: fn.functionName });
  }
}
