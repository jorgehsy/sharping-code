import type { FrameName } from './frames.ts';
import type { Hero } from './heroes.ts';
import { ALL_MONSTERS } from './monsters.ts';

export const heroFrame = (hero: Hero): FrameName => `${hero}_idle_anim_f0`;

/** Portrait frame of a monster (falls back to a small zombie for an unknown kind). */
export function monsterFrame(kind: string): FrameName {
  return (ALL_MONSTERS as readonly string[]).includes(kind) ? (`${kind}_idle_anim_f0` as FrameName) : 'tiny_zombie_idle_anim_f0';
}
