import * as cdk from 'aws-cdk-lib';
import { ClockStack } from '../lib/clock-stack.js';

const app = new cdk.App();
new ClockStack(app, 'ClockSpikeStack');
