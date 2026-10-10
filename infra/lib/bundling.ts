import { AssetHashType, DockerImage, RemovalPolicy } from 'aws-cdk-lib';
import { Architecture, Code, Function as LambdaFunction, Runtime, type FunctionProps } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { buildSync } from 'esbuild';
import type { Construct } from 'constructs';
import { statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const REPO_ROOT = resolve(import.meta.dirname, '../..');

const entryOf = (pkg: string) => resolve(REPO_ROOT, 'packages', pkg, 'src/handler.ts');

/** ESM needs this banner: AWS SDK CJS deps fail with "Dynamic require" otherwise. */
const BANNER = "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);";

export interface BundledFunctionProps extends Omit<FunctionProps, 'code' | 'handler' | 'runtime' | 'architecture' | 'logGroup'> {
  /** Workspace package under `packages/` whose `src/handler.ts` is the entry. */
  pkg: string;
  /** Modules left out of the bundle. Default: the SDK v3 that the Node runtime provides. */
  external?: string[];
}

/**
 * Lambda bundled with the esbuild JS API (ESM, minified, node24, arm64), at synth time, no Docker.
 *
 * Why not `NodejsFunction`: it shells out to `pnpm exec -- esbuild` from the repo root, and the root
 * `.bin/esbuild` shim that pnpm hoists (via tsx) runs the native binary through `node` and crashes. Using the JS API
 * from this package's own `esbuild` dependency avoids the shim. Esbuild resolves workspace deps through
 * `node_modules` symlinks, so it works with pnpm.
 */
export function bundledFunction(scope: Construct, id: string, props: BundledFunctionProps): LambdaFunction {
  const { pkg, external = ['@aws-sdk/*'], ...rest } = props;
  const entry = entryOf(pkg);

  return new LambdaFunction(scope, id, {
    ...rest,
    runtime: Runtime.NODEJS_24_X,
    architecture: Architecture.ARM_64,
    handler: 'index.handler',
    logGroup: new LogGroup(scope, `${id}Logs`, { retention: RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.DESTROY }),
    code: Code.fromAsset(dirname(entry), {
      assetHashType: AssetHashType.OUTPUT, // hash of the bundle, not of the sources
      bundling: {
        image: DockerImage.fromRegistry('scratch'), // required by the API, never used (local bundling succeeds)
        local: {
          tryBundle(outputDir: string) {
            const outfile = resolve(outputDir, 'index.mjs');
            buildSync({
              entryPoints: [entry],
              outfile,
              bundle: true,
              minify: true,
              format: 'esm',
              platform: 'node',
              target: 'node24',
              mainFields: ['module', 'main'],
              banner: { js: BANNER },
              external,
              logLevel: 'warning',
            });
            console.error(`[bundle] ${pkg}: ${(statSync(outfile).size / 1024).toFixed(1)} KiB`);
            return true;
          },
        },
      },
    }),
  });
}
