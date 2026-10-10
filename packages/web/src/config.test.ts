import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

const env = { VITE_API_URL: 'https://a.example/', VITE_EVENTS_HTTP_DNS: 'h', VITE_EVENTS_REALTIME_DNS: 'r', VITE_EVENTS_API_KEY: 'k' };

describe('loadConfig', () => {
  it('reads and normalizes', () => {
    expect(loadConfig({ ...env, VITE_MOCK_ORDERS: 'true' })).toMatchObject({ apiUrl: 'https://a.example', mockOrders: true });
    expect(loadConfig(env).mockOrders).toBe(false);
  });
  it('lists every missing var without echoing values', () => {
    expect(() => loadConfig({ VITE_API_URL: 'x' })).toThrow(/VITE_EVENTS_HTTP_DNS, VITE_EVENTS_REALTIME_DNS, VITE_EVENTS_API_KEY/);
  });
});
