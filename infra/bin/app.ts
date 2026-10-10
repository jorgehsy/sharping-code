import { App } from 'aws-cdk-lib';
import { SharpingCodeStack } from '../lib/stack.ts';

// Env-agnostic: account/region come from the CLI profile at deploy time.
const app = new App();
new SharpingCodeStack(app, 'SharpingCodeStack');
