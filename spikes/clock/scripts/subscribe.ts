// Usage: tsx scripts/subscribe.ts <gameCode> <realtimeDns> <httpDns> <apiKey>
//   or env: REALTIME_DNS HTTP_DNS API_KEY
// Node 24 global WebSocket. AppSync Events API-key subprotocol auth.
const [gameCode, rt = process.env.REALTIME_DNS, http = process.env.HTTP_DNS, apiKey = process.env.API_KEY] =
  process.argv.slice(2);
if (!gameCode || !rt || !http || !apiKey) {
  console.error('usage: subscribe.ts <gameCode> <realtimeDns> <httpDns> <apiKey>');
  process.exit(1);
}

const b64url = (s: string) => Buffer.from(s).toString('base64url');
const auth = { host: http, 'x-api-key': apiKey };
const ws = new WebSocket(`wss://${rt}/event/realtime`, [
  'aws-appsync-event-ws',
  `header-${b64url(JSON.stringify(auth))}`,
]);

interface Row { type: string; seq: number; lag: number; pubLag: number; netLag: number }
const rows: Row[] = [];

ws.onopen = () => ws.send(JSON.stringify({ type: 'connection_init' }));
ws.onerror = (e) => console.error('ws error', e);
ws.onclose = (e) => console.log('closed', e.code, e.reason);

ws.onmessage = (m) => {
  const msg = JSON.parse(String(m.data));
  switch (msg.type) {
    case 'connection_ack':
      ws.send(JSON.stringify({
        type: 'subscribe', id: crypto.randomUUID(), channel: `/game/${gameCode}`, authorization: auth,
      }));
      break;
    case 'subscribe_success':
      console.log(`subscribed to /game/${gameCode}`);
      break;
    case 'data': {
      const receivedAt = Date.now();
      const ev = JSON.parse(msg.event);
      const row = {
        type: ev.type, seq: ev.seq,
        lag: receivedAt - ev.plannedAt,   // end to end: planned -> received
        pubLag: ev.at - ev.plannedAt,     // planned -> publish step ran (clock accuracy)
        netLag: receivedAt - ev.at,       // publish -> received (AppSync + network)
      };
      rows.push(row);
      console.log(`#${row.seq} ${row.type} lag=${row.lag}ms (clock=${row.pubLag}ms, delivery=${row.netLag}ms)`);
      if (ev.type === 'game.finished') summary();
      break;
    }
    case 'ka': break;
    case 'subscribe_error': case 'error':
      console.error(JSON.stringify(msg)); break;
  }
};

function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const p95 = s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)];
  return `avg=${(s.reduce((a, b) => a + b, 0) / s.length).toFixed(0)}ms p95=${p95}ms max=${s.at(-1)}ms`;
}

function summary() {
  console.log('\n--- summary (note: includes local-vs-AWS clock skew) ---');
  console.log(`count=${rows.length}`);
  console.log(`end-to-end lag (received-planned): ${stats(rows.map((r) => r.lag))}`);
  console.log(`clock lag (at-planned):            ${stats(rows.map((r) => r.pubLag))}`);
  console.log(`delivery (received-at):            ${stats(rows.map((r) => r.netLag))}`);
  const seqs = rows.map((r) => r.seq);
  const gaps = seqs.some((s, i) => i > 0 && s !== seqs[i - 1] + 1);
  console.log(`seq gaps: ${gaps ? 'YES ' + seqs.join(',') : 'none'}`);
  ws.close();
}
