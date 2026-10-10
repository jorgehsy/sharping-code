import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import type { PublishedEvent } from './schedule.js';

export type PublishFn = (channel: string, event: PublishedEvent) => Promise<void>;

/** AppSync Events HTTP publish, SigV4 (service name "appsync"), IAM auth. Max 5 events per call; we send 1. */
export function createAppSyncPublisher(httpDomain: string, region: string): PublishFn {
  const signer = new SignatureV4({
    service: 'appsync',
    region,
    credentials: defaultProvider(),
    sha256: Sha256,
  });

  return async (channel, event) => {
    const body = JSON.stringify({ channel, events: [JSON.stringify(event)] });
    const req = new HttpRequest({
      method: 'POST',
      protocol: 'https:',
      hostname: httpDomain,
      path: '/event',
      headers: {
        'content-type': 'application/json',
        host: httpDomain,
      },
      body,
    });
    const signed = await signer.sign(req);
    const { host: _host, ...headers } = signed.headers as Record<string, string>;
    const res = await fetch(`https://${httpDomain}/event`, {
      method: 'POST',
      headers,
      body,
    });
    if (!res.ok) {
      throw new Error(`AppSync publish failed ${res.status}: ${await res.text()}`);
    }
    // 200 can still carry per-event failures
    const json = (await res.json().catch(() => ({}))) as { failed?: unknown[] };
    if (json.failed && json.failed.length > 0) {
      throw new Error(`AppSync publish partial failure: ${JSON.stringify(json.failed)}`);
    }
  };
}
