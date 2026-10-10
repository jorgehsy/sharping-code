import { createHttpApi } from './api/client.ts';
import { loadConfig, type Config } from './config.ts';
import { createGameController } from './game/controller.ts';
import { withMockOrders } from './mock/index.ts';
import { createRealtime } from './realtime/client.ts';
import { createSessionStore } from './session.ts';
import { createGameStore } from './store/store.ts';

/** Composition root: the only place that knows real vs mock. */
export function createApp(env: Record<string, unknown> = import.meta.env, config: Config = loadConfig(env)) {
  let api = createHttpApi({ baseUrl: config.apiUrl });
  let realtime = createRealtime({
    realtimeDns: config.eventsRealtimeDns,
    httpDns: config.eventsHttpDns,
    apiKey: config.eventsApiKey,
  });
  if (config.mockOrders) ({ api, realtime } = withMockOrders(api, realtime));

  const store = createGameStore();
  const controller = createGameController({ api, realtime, store, sessions: createSessionStore(globalThis.localStorage) });
  return { config, store, controller };
}

export type App = ReturnType<typeof createApp>;
