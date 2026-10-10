import type { CSSProperties } from 'react';
import { ATLAS_SIZE, ATLAS_URL, FRAMES, type FrameName } from '../kitchen/frames.ts';

/** A frame of the 0x72 atlas as a CSS sprite (pixelated). `scale` multiplies the native 16 px grid. */
export function Sprite({ name, scale = 1, style }: { name: FrameName; scale?: number; style?: CSSProperties }) {
  const [x, y, w, h] = FRAMES[name];
  return (
    <span
      className="spr"
      aria-hidden
      style={{
        width: w * scale,
        height: h * scale,
        backgroundImage: `url(${ATLAS_URL})`,
        backgroundSize: `${ATLAS_SIZE * scale}px ${ATLAS_SIZE * scale}px`,
        backgroundPosition: `-${x * scale}px -${y * scale}px`,
        ...style,
      }}
    />
  );
}

/** Just the face of a hero (the top of the 16x28 idle frame). */
export function Head({ frame, title }: { frame: FrameName; title?: string }) {
  return (
    <span className="head" title={title}>
      <Sprite name={frame} style={{ marginTop: -6 }} />
    </span>
  );
}
