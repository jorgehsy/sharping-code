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
