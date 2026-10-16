import { createMute, type Mute } from './mute.ts';
import { audioContext } from './player.ts';

/** "The Old Tower Inn" loop by RandomMind, CC0 (public/assets/music/README.md). */
export const MUSIC_URL = '/assets/music/old-tower-inn.mp3';
/** Well under the sfx (0.5): background only. */
export const MUSIC_VOLUME = 0.07;
const FADE_S = 1.5;
/** Samples quieter than this at the edges are encoder padding, trimmed so the loop has no gap. */
const SILENCE = 1e-3;

export interface MusicPlayer extends Mute {
  /** Wanted on or off (idempotent). Plays only while wanted and not muted. */
  setWanted(wanted: boolean): void;
}

/** First/last audible sample, in seconds: the loop points. */
export function loopBounds(buf: Pick<AudioBuffer, 'numberOfChannels' | 'length' | 'sampleRate' | 'getChannelData'>): [number, number] {
  let start = buf.length;
  let end = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    let i = 0;
    while (i < d.length && Math.abs(d[i]!) < SILENCE) i++;
    let j = d.length - 1;
    while (j > i && Math.abs(d[j]!) < SILENCE) j--;
    start = Math.min(start, i);
    end = Math.max(end, j + 1);
  }
  if (end <= start) return [0, buf.length / buf.sampleRate];
  return [start / buf.sampleRate, end / buf.sampleRate];
}

export function createMusicPlayer(storage: Storage | undefined = globalThis.localStorage): MusicPlayer {
  let wanted = false;
  let buffer: Promise<AudioBuffer | null> | undefined;
  let playing: { src: AudioBufferSourceNode; gain: GainNode } | undefined;

  const load = (ac: AudioContext) =>
    (buffer ??= fetch(MUSIC_URL)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
      .then((b) => ac.decodeAudioData(b))
      .catch(() => null));

  const start = () => {
    const ac = audioContext();
    if (!ac || playing) return;
    if (ac.state === 'suspended') void ac.resume().catch(() => {});
    void load(ac).then((buf) => {
      if (!buf || playing || !wanted || mute.muted()) return;
      const [loopStart, loopEnd] = loopBounds(buf);
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = loopStart;
      src.loopEnd = loopEnd;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0, ac.currentTime);
      gain.gain.linearRampToValueAtTime(MUSIC_VOLUME, ac.currentTime + FADE_S);
      src.connect(gain).connect(ac.destination);
      src.start(0, loopStart);
      playing = { src, gain };
    });
  };

  const stop = () => {
    const ac = audioContext();
    if (!ac || !playing) return;
    const { src, gain } = playing;
    playing = undefined;
    gain.gain.cancelScheduledValues(ac.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ac.currentTime);
    gain.gain.linearRampToValueAtTime(0, ac.currentTime + FADE_S);
    src.stop(ac.currentTime + FADE_S);
  };

  const sync = () => (wanted && !mute.muted() ? start() : stop());
  const mute = createMute('sharping.musicMuted', storage, sync);

  return {
    ...mute,
    setWanted(value) {
      if (value === wanted) return;
      wanted = value;
      sync();
    },
  };
}
