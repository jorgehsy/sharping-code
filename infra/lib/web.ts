import { CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Distribution, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface WebProps {
  /** Built frontend (`pnpm --filter @sharping/web build`). */
  distDir: string;
}

/**
 * Static hosting: private bucket, CloudFront with OAC, HTTPS only. Files go up with `deploy()`, called once the
 * API exists (the API's CORS needs this domain, the frontend config needs the API's URL).
 */
export class Web extends Construct {
  readonly distribution: Distribution;
  readonly url: string;
  private readonly bucket: Bucket;
  private readonly distDir: string;

  constructor(scope: Construct, id: string, props: WebProps) {
    super(scope, id);
    if (!existsSync(join(props.distDir, 'index.html')))
      throw new Error(`${props.distDir}/index.html missing: run \`pnpm --filter @sharping/web build\` first`);

    this.distDir = props.distDir;
    this.bucket = new Bucket(this, 'Bucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    this.distribution = new Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      // Single page: unknown paths serve the app.
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: Duration.seconds(0),
      })),
    });

    this.url = `https://${this.distribution.distributionDomainName}`;
    new CfnOutput(scope, 'WebUrl', { value: this.url });
  }

  /** Uploads the build plus `/config.json`, which the frontend reads at startup (values resolve at deploy time). */
  deploy(runtimeConfig: Record<string, string>): void {
    new BucketDeployment(this, 'Deploy', {
      destinationBucket: this.bucket,
      sources: [Source.asset(this.distDir), Source.jsonData('config.json', runtimeConfig)],
      distribution: this.distribution,
      distributionPaths: ['/*'],
      memoryLimit: 512,
    });
  }
}
