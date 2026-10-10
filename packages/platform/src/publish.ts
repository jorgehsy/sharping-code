import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { gameChannel, type GameEvent } from '@sharping/shared';

/** AppSync Events accepts at most 5 events per publish call. */
export const MAX_EVENTS_PER_CALL = 5;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

let signer: SignatureV4 | undefined;
const getSigner = () =>
  (signer ??= new SignatureV4({
    service: 'appsync',
    region: process.env.AWS_REGION!,
    credentials: defaultProvider(),
    sha256: Sha256,
  }));

async function postBatch(domain: string, channel: string, events: GameEvent[]): Promise<void> {
  const body = JSON.stringify({ channel, events: events.map((e) => JSON.stringify(e)) });
  const req = new HttpRequest({
    method: 'POST',
    protocol: 'https:',
    hostname: domain,
    path: '/event',
    headers: { 'content-type': 'application/json', host: domain },
    body,
  });
  const signed = await getSigner().sign(req);
  const { host: _host, ...headers } = signed.headers as Record<string, string>;
  const res = await fetch(`https://${domain}/event`, { method: 'POST', headers, body });
  if (!res.ok) throw new Error(`AppSync publish failed ${res.status}: ${await res.text()}`);
  // 200 can still carry per-event failures.
  const json = (await res.json().catch(() => ({}))) as { failed?: unknown[] };
  if (json.failed && json.failed.length > 0) {
    throw new Error(`AppSync publish partial failure: ${JSON.stringify(json.failed)}`);
  }
}

/** Publish envelopes to `/game/{code}` via AppSync Events HTTP (IAM / SigV4). Chunks into calls of max 5. */
export async function publish(code: string, events: GameEvent[]): Promise<void> {
  if (events.length === 0) return;
  const domain = process.env.HTTP_DOMAIN;
  if (!domain) throw new Error('HTTP_DOMAIN env var is not set');
  const channel = gameChannel(code);
  // Sequential keeps ordering inside the channel.
  for (const batch of chunk(events, MAX_EVENTS_PER_CALL)) await postBatch(domain, channel, batch);
}
