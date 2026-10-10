import { App } from "aws-cdk-lib";
import { RunnerStack } from "../lib/runner-stack.js";

const app = new App();
new RunnerStack(app, "RunnerSpikeStack");
