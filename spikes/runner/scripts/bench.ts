// Usage: FUNCTION_NAME=... npx tsx scripts/bench.ts [N=30]   (needs AWS creds; run manually)
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

const name = process.env.FUNCTION_NAME ?? process.argv[3];
if (!name) { console.error("Set FUNCTION_NAME (stack output) or pass as 2nd arg"); process.exit(1); }
const n = Number(process.argv[2] ?? 30);
const client = new LambdaClient({});

const payload = {
  source: "function solve(nums: number[]): number {\n  return nums.reduce((a, b) => a + b, 0);\n}",
  entry: "solve",
  cases: [
    { input: [[1, 2, 3, 4]], output: 10 },
    { input: [[5, 5]], output: 10 },
    { input: [[]], output: 0, hidden: true },
  ],
};

const lat: number[] = [];
const inner: number[] = [];
for (let i = 0; i < n; i++) {
  const t = performance.now();
  const res = await client.send(new InvokeCommand({ FunctionName: name, Payload: JSON.stringify(payload) }));
  lat.push(performance.now() - t);
  const body = JSON.parse(Buffer.from(res.Payload!).toString());
  if (res.FunctionError || !body.passed) console.error(`call ${i} unexpected:`, body);
  else inner.push(body.durationMs);
}
const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.ceil((p / 100) * a.length) - 1)];
const f = (x: number) => x.toFixed(0) + "ms";
console.log(`first (cold): ${f(lat[0])} (inner ${inner[0] ?? "?"}ms)`);
const warm = lat.slice(1);
if (warm.length) console.log(`warm n=${warm.length}: p50 ${f(pct(warm, 50))}  p95 ${f(pct(warm, 95))}  max ${f(Math.max(...warm))}`);
console.log(`all n=${lat.length}: p50 ${f(pct(lat, 50))}  p95 ${f(pct(lat, 95))}  max ${f(Math.max(...lat))}`);
if (inner.length) console.log(`handler-internal durationMs: p50 ${pct(inner, 50)}  p95 ${pct(inner, 95)}`);
