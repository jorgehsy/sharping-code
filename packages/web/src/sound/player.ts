import type { Cue } from './cues.ts';
import { createMute, type Mute } from './mute.ts';

/** CC0 clips (public/assets/sfx/README.md), one file per cue. */
export const SFX_URL = (cue: Cue) => `/assets/sfx/${cue}.mp3`;

const VOLUME = 0.3;
/** Softer cues: things other players did. */
const QUIET: Partial<Record<Cue, number>> = { playerJoined: 0.6 };

export interface SoundPlayer extends Mute {
  play(cue: Cue): void;
}

/** One AudioContext for the whole app, created lazily (sfx and music share it). */
let shared: AudioContext | undefined;
export function audioContext(): AudioContext | undefined {
  if (!shared && typeof AudioContext !== 'undefined') shared = new AudioContext();
  return shared;
}

/** Browsers keep audio suspended until a user gesture: resume on the first one (e.g. after a reload into the lobby). */
export function unlockOnGesture(target: Pick<Document, 'addEventListener' | 'removeEventListener'> | undefined = globalThis.document) {
  if (!target) return;
  const unlock = () => {
    void audioContext()?.resume().catch(() => {});
    target.removeEventListener('pointerdown', unlock);
    target.removeEventListener('keydown', unlock);
  };
  target.addEventListener('pointerdown', unlock);
  target.addEventListener('keydown', unlock);
}

/** Web Audio sfx player shared by React and Phaser screens. Clips are fetched lazily on first play. */
export function createSoundPlayer(storage: Storage | undefined = globalThis.localStorage): SoundPlayer {
  const buffers = new Map<Cue, Promise<AudioBuffer | null>>();
  const mute = createMute('sharping.muted', storage, (m) => {
    if (!m) void audioContext()?.resume().catch(() => {});
  });

  const load = (ac: AudioContext, cue: Cue) => {
    let p = buffers.get(cue);
    if (!p) {
      p = fetch(SFX_URL(cue))
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
        .then((b) => ac.decodeAudioData(b))
        .catch(() => null);
      buffers.set(cue, p);
    }
    return p;
  };

  return {
    ...mute,
    play(cue) {
      if (mute.muted()) return;
      const ac = audioContext();
      if (!ac) return;
      if (ac.state === 'suspended') void ac.resume().catch(() => {});
      void load(ac, cue).then((buf) => {
        if (!buf || mute.muted() || ac.state !== 'running') return;
        const gain = ac.createGain();
        gain.gain.value = VOLUME * (QUIET[cue] ?? 1);
        const src = ac.createBufferSource();
        src.buffer = buf;
        src.connect(gain).connect(ac.destination);
        src.start();
      });
    },
  };
}
