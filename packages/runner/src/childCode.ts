// Runs inside the fresh child (node --permission -e). stdin: JSON {js, entry, inputs, nonce}.
// The child never sees expected outputs. stdout: `<nonce>{json}` where actuals use a tagged encoding.
export const CHILD_CODE = String.raw`
const fs = require("node:fs");
const writeOut = fs.writeSync.bind(fs, 1);
const enc = (v) => {
  if (v === undefined) return { $: "u" };
  if (typeof v === "number" && !Number.isFinite(v)) return { $: "n", v: String(v) };
  if (typeof v === "bigint") return { $: "b", v: String(v) };
  if (Array.isArray(v)) return { $: "a", v: v.map(enc) };
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = enc(v[k]); return { $: "o", v: o }; }
  if (typeof v === "function" || typeof v === "symbol") return { $: "s", v: String(v) };
  return { $: "p", v };
};
(async () => {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const { js, entry, inputs, nonce, taste } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const send = (o) => writeOut("\n" + nonce + JSON.stringify(o) + "\n");
  let fn;
  try { fn = (0, eval)(js + "\n;typeof " + entry + " === 'function' ? " + entry + " : undefined"); }
  catch (e) { return send({ status: "runtime", message: String(e && e.message || e) }); }
  if (typeof fn !== "function") return send({ status: "runtime", message: "function " + entry + " not defined" });
  const actuals = [];
  for (let i = 0; i < inputs.length; i++) {
    try { actuals.push(enc(await fn(...structuredClone(inputs[i])))); }
    catch (e) {
      if (taste) { actuals.push({ $: "x", v: String(e && e.message || e) }); continue; }
      return send({ status: "runtime", index: i, message: String(e && e.message || e) });
    }
  }
  send({ status: "ok", actuals });
})().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
`;

export function decode(e: any): unknown {
  switch (e.$) {
    case "u": return undefined;
    case "n": return Number(e.v);
    case "b": return BigInt(e.v);
    case "a": return e.v.map(decode);
    case "o": { const o: Record<string, unknown> = {}; for (const k of Object.keys(e.v)) o[k] = decode(e.v[k]); return o; }
    default: return e.v;
  }
}
