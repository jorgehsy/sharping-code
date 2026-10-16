import { describe, expect, it } from 'vitest';
import { loopBounds } from './music.ts';

const buf = (...channels: number[][]) => ({
  numberOfChannels: channels.length,
  length: channels[0]!.length,
  sampleRate: 10,
  getChannelData: (c: number) => Float32Array.from(channels[c]!),
});

describe('loopBounds', () => {
  it('trims silent padding at both ends', () => {
    expect(loopBounds(buf([0, 0, 0.5, 0.2, 0.3, 0]))).toEqual([0.2, 0.5]);
  });

  it('keeps the widest span across channels', () => {
    expect(loopBounds(buf([0, 0.5, 0, 0], [0, 0, 0, 0.5]))).toEqual([0.1, 0.4]);
  });

  it('falls back to the whole buffer when all silent', () => {
    expect(loopBounds(buf([0, 0, 0, 0]))).toEqual([0, 0.4]);
  });
});
