import { describe, expect, it } from "vitest";
import { handler } from "../src/handler.js";

const cases = [
  { input: [[1, 2, 3, 4]], output: 10 },
  { input: [[]], output: 0, hidden: true },
];
const run = (source: string, extra: object = {}, c: any[] = cases) =>
  handler({ source, entry: "solve", cases: c, ...extra } as any);

describe("runner", () => {
  it("passes a correct solution", async () => {
    const r = await run("function solve(n: number[]): number { return n.reduce((a, b) => a + b, 0); }");
    expect(r.passed).toBe(true);
  });

  it("wrong on public case shows case data", async () => {
    const r: any = await run("function solve(n: number[]) { return 1; }");
    expect(r).toMatchObject({ passed: false, reason: "wrong", case: { input: [[1, 2, 3, 4]], expected: 10, actual: 1 } });
    expect(r.hidden).toBeUndefined();
  });

  it("wrong on hidden case hides data", async () => {
    const r: any = await run("function solve(n: number[]) { return n.length ? n.reduce((a,b)=>a+b,0) : 99; }");
    expect(r.reason).toBe("wrong");
    expect(r.hidden).toBe(true);
    expect(r.case).toBeUndefined();
  });

  it("infinite loop times out and is killed", async () => {
    const r = await run("function solve(n: number[]) { while (true) {} }");
    expect(r).toMatchObject({ passed: false, reason: "timeout" });
    expect(r.durationMs).toBeLessThan(3500);
  });

  it("thrown error -> runtime", async () => {
    const r: any = await run("function solve(n: number[]) { throw new Error('boom'); }");
    expect(r).toMatchObject({ reason: "runtime", message: "boom" });
  });

  it("syntax error -> compile", async () => {
    const r = await run("function solve( {");
    expect(r).toMatchObject({ passed: false, reason: "compile" });
  });

  it("no-loops detected (and allowed when absent)", async () => {
    const bad = await run("function solve(n: number[]) { let s = 0; for (const x of n) s += x; return s; }", { sabotage: "no-loops" });
    expect(bad).toMatchObject({ passed: false, reason: "sabotage" });
    const bad2 = await run("function solve(n: number[]) { let i = 0; do { i++; } while (i < 1); return 0; }", { sabotage: "no-loops" });
    expect(bad2).toMatchObject({ reason: "sabotage" });
    const ok = await run("function solve(n: number[]) { return n.reduce((a, b) => a + b, 0); }", { sabotage: "no-loops" });
    expect(ok.passed).toBe(true);
  });

  it("max-lines-3 detected", async () => {
    const src = "function solve(n: number[]) {\n\n  const s = n.reduce((a, b) => a + b, 0);\n  return s;\n}\n";
    expect(await run(src, { sabotage: "max-lines-3" })).toMatchObject({ reason: "sabotage" });
    expect((await run("function solve(n: number[]) {\n  return n.reduce((a, b) => a + b, 0);\n}", { sabotage: "max-lines-3" })).passed).toBe(true);
  });

  it("child process sees an empty env (no AWS creds)", async () => {
    process.env.AWS_ACCESS_KEY_ID = "AKIAFAKEFAKEFAKE";
    process.env.AWS_SECRET_ACCESS_KEY = "secret";
    try {
      const r: any = await run("function solve(n: number[]) { return Object.keys(process.env); }", {}, [{ input: [[]], output: ["LEAK"] as any }]);
      expect(r.reason).toBe("wrong");
      expect(r.case.actual.filter((k: string) => !k.startsWith("__CF_"))).toEqual([]); // macOS adds __CF_USER_TEXT_ENCODING
      expect(r.case.actual.some((k: string) => k.startsWith("AWS_"))).toBe(false);
    } finally {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
    }
  });

  it("permission model blocks fs, child_process, worker_threads", async () => {
    const one = [{ input: [[]], output: 0 }];
    for (const body of [
      "return require('fs').readFileSync('/etc/hosts', 'utf8')",
      "return require('child_process').execSync('id').toString()",
      "const { Worker } = require('worker_threads'); new Worker('1', { eval: true }); return 0",
    ]) {
      const r: any = await run(`function solve(n: number[]): any { ${body} }`, {}, one);
      expect(r, body).toMatchObject({ passed: false, reason: "runtime" });
    }
  });

  it("accepts `export function solve`", async () => {
    const r = await run("export function solve(n: number[]): number { return n.reduce((a, b) => a + b, 0); }");
    expect(r.passed).toBe(true);
  });

  it("supports enums and non-JSON actuals (undefined/NaN/bigint)", async () => {
    const r1 = await run("enum E { A = 3 }\nfunction solve(n: number[]) { return E.A; }", {}, [{ input: [[]], output: 3 }]);
    expect(r1.passed).toBe(true);
    const r2: any = await run("function solve(n: number[]) { return undefined; }", {}, [{ input: [[]], output: 0 }]);
    expect(r2.case.actual).toBeUndefined();
    expect(r2.reason).toBe("wrong");
  });

  it("child never receives expected outputs", async () => {
    const r: any = await run("function solve(n: number[]) { return 1; }", {}, [{ input: [[]], output: "SECRET" }]);
    expect(r.reason).toBe("wrong");
  });
});
