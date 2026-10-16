export interface Config {
  apiUrl: string;
  eventsHttpDns: string;
  eventsRealtimeDns: string;
  eventsApiKey: string;
  mockOrders: boolean;
}

const REQUIRED = {
  apiUrl: 'VITE_API_URL',
  eventsHttpDns: 'VITE_EVENTS_HTTP_DNS',
  eventsRealtimeDns: 'VITE_EVENTS_REALTIME_DNS',
  eventsApiKey: 'VITE_EVENTS_API_KEY',
} as const;

/**
 * `/config.json`, written by the CDK deploy next to the hosted build (keys of `Config`). Mapped to the env names so
 * deployed values override whatever was baked into the bundle at build time. Anything not an object is ignored.
 */
export function withRuntimeConfig(env: Record<string, unknown>, runtime: unknown): Record<string, unknown> {
  if (!runtime || typeof runtime !== 'object') return env;
  const out = { ...env };
  for (const [key, name] of Object.entries(REQUIRED)) {
    const v = (runtime as Record<string, unknown>)[key];
    if (typeof v === 'string' && v.trim()) out[name] = v;
  }
  return out;
}

/** The deployed `/config.json`, or undefined (dev server, offline, not JSON). */
export async function fetchRuntimeConfig(): Promise<unknown> {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return undefined;
    return await res.json();
  } catch {
    return undefined;
  }
}

/** Pure: takes the env record (import.meta.env) so it can be tested. Throws listing every missing var. */
export function loadConfig(env: Record<string, unknown>): Config {
  const missing: string[] = [];
  const out: Record<string, string> = {};
  for (const [key, name] of Object.entries(REQUIRED)) {
    const v = env[name];
    if (typeof v === 'string' && v.trim()) out[key] = v.trim();
    else missing.push(name);
  }
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')} (see .env.example)`);
  return {
    apiUrl: out.apiUrl!.replace(/\/+$/, ''),
    eventsHttpDns: out.eventsHttpDns!,
    eventsRealtimeDns: out.eventsRealtimeDns!,
    eventsApiKey: out.eventsApiKey!,
    mockOrders: env.VITE_MOCK_ORDERS === 'true',
  };
}
