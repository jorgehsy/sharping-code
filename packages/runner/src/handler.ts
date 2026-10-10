import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { stripTypeScriptTypes } from "node:module";
import { checkSabotage } from "./sabotage.ts";
import { CHILD_CODE, decode } from "./childCode.ts";
import type { RunnerEvent, RunnerResult, TasteCase, TasteResult } from "@sharping/shared";


// stripTypeScriptTypes is experimental: silence only its warning.
const origEmit = process.emitWarning.bind(process);
process.emitWarning = ((w: any, ...a: any[]) => {
  if (String(w?.message ?? w).includes("stripTypeScriptTypes")) return;
  return (origEmit as any)(w, ...a);
}) as typeof process.emitWarning;

const TIMEOUT_MS = 2000;
const MAX_OUTPUT = 1_000_000;

interface ChildResult { status: "ok" | "runtime"; index?: number; actuals?: any[]; message?: string }

function runChild(js: string, event: RunnerEvent): Promise<ChildResult | "timeout" | "crash"> {
  const nonce = randomBytes(16).toString("hex");
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["--permission", "--max-old-space-size=64", "-e", CHILD_CODE],
      { env: {}, stdio: ["pipe", "pipe", "ignore"] },
    );
    let out = "";
    let settled = false;
    const finish = (r: ChildResult | "timeout" | "crash") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      resolve(r);
    };
    const timer = setTimeout(() => finish("timeout"), TIMEOUT_MS);
    child.stdout.on("data", (d) => {
      out += d;
      if (out.length > MAX_OUTPUT) finish("crash");
    });
    child.on("error", () => finish("crash"));
    child.on("close", () => {
      const line = out.split("\n").reverse().find((l) => l.startsWith(nonce));
      if (!line) return finish("crash");
      try { finish(JSON.parse(line.slice(nonce.length))); } catch { finish("crash"); }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify({
      js, entry: event.entry, inputs: event.cases.map((c) => c.input), nonce,
      ...(event.mode === "taste" ? { taste: true } : {}),
    }));
  });
}

export async function handler(event: RunnerEvent | { warmup: true }): Promise<RunnerResult | TasteResult | { ok: true }> {
  // Warm-up ping (sent at game start to pre-warm the Lambda): no work.
  if ("warmup" in event && event.warmup) return { ok: true };
  return runEvent(event as RunnerEvent);
}

async function runEvent(event: RunnerEvent): Promise<RunnerResult | TasteResult> {
  const taste = event.mode === "taste";
  const start = performance.now();
  const done = <T extends object>(r: T) => ({ ...r, durationMs: Math.round(performance.now() - start) }) as any;
  const fail = (reason: "compile" | "sabotage" | "timeout" | "runtime", message: string) =>
    done(taste ? { ok: false, reason, message } : { passed: false, reason, message });

  let js: string;
  try {
    // Accept `export function solve`; transform mode also supports enums/namespaces.
    js = stripTypeScriptTypes(event.source.replace(/^(\s*)export\s+/gm, "$1"), { mode: "transform" as any });
  } catch (e: any) {
    return fail("compile", String(e?.message ?? e));
  }

  if (event.sabotage) {
    let msg: string | null;
    try { msg = checkSabotage(event.sabotage, event.source, js); }
    catch (e: any) { return fail("compile", String(e?.message ?? e)); }
    if (msg) return fail("sabotage", msg);
  }

  const r = await runChild(js, event);
  if (r === "timeout") return fail("timeout", `Exceeded ${TIMEOUT_MS}ms`);
  if (r === "crash") return fail("runtime", "Process crashed (out of memory or invalid output)");
  if (r.status === "runtime") return fail("runtime", r.message ?? "");
  if (taste) {
    const results: TasteCase[] = event.cases.map((c, i) => {
      const raw = r.actuals![i];
      if (raw.$ === "x") return { input: c.input, expected: c.output, error: String(raw.v), passed: false };
      const actual = decode(raw);
      return { input: c.input, expected: c.output, actual, passed: isDeepStrictEqual(actual, c.output) };
    });
    return done({ ok: true, cases: results });
  }
  for (let i = 0; i < event.cases.length; i++) {
    const c = event.cases[i]!;
    const actual = decode(r.actuals![i]);
    if (isDeepStrictEqual(actual, c.output)) continue;
    if (c.hidden) return done({ passed: false, reason: "wrong", hidden: true });
    return done({ passed: false, reason: "wrong", case: { input: c.input, expected: c.output, actual } });
  }
  return done({ passed: true });
}
