import { createHttpApi } from './api/client.ts';
import { loadConfig, type Config } from './config.ts';
import { createGameController } from './game/controller.ts';
import { withMockOrders } from './mock/index.ts';
import { createRealtime } from './realtime/client.ts';
import { createSessionStore } from './session.ts';
import { listenForSounds } from './sound/listen.ts';
import { createMusicPlayer } from './sound/music.ts';
import { createSoundPlayer, unlockOnGesture } from './sound/player.ts';
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
  const sound = createSoundPlayer();
  const music = createMusicPlayer();
  unlockOnGesture();
  listenForSounds(store, sound, music);
  return { config, store, controller, sound, music };
}

export type App = ReturnType<typeof createApp>;
