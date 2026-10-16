import type { GameStore } from '../store/store.ts';
import { serverNow } from '../store/time.ts';
import { cuesFor, hurryOrder, wantsMusic } from './cues.ts';
import type { MusicPlayer } from './music.ts';
import type { SoundPlayer } from './player.ts';

const HURRY_CHECK_MS = 1000;

/** Wires the store to sfx (transitions, 30s "hurry" warning) and music (on/off by screen). Returns a stop function. */
export function listenForSounds(store: GameStore, player: SoundPlayer, music: MusicPlayer, now: () => number = Date.now): () => void {
  const warned = new Set<string>();
  music.setWanted(wantsMusic(store.getState()));
  const unsubscribe = store.subscribe((next, prev) => {
    for (const cue of cuesFor(prev, next)) player.play(cue);
    music.setWanted(wantsMusic(next));
  });
  const timer = setInterval(() => {
    const s = store.getState();
    const id = hurryOrder(s, serverNow(s.clockOffset, now()), warned);
    if (id) {
      warned.add(id);
      player.play('hurry');
    }
  }, HURRY_CHECK_MS);
  return () => {
    unsubscribe();
    clearInterval(timer);
  };
}
