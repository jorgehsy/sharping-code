/** The 10 hero chefs, assigned to players by join order (index in `players`). More than 10 players reuse heroes. */
export const HEROES = [
  'knight_m',
  'elf_f',
  'dwarf_m',
  'wizzard_f',
  'lizard_m',
  'knight_f',
  'elf_m',
  'wizzard_m',
  'dwarf_f',
  'lizard_f',
] as const;

export type Hero = (typeof HEROES)[number];

/** Chefs standing behind the counter (one per hero). Players beyond this have a hero but no chef in the scene. */
export const MAX_CHEFS: number = HEROES.length;

export const heroForIndex = (joinIndex: number): Hero => HEROES[((joinIndex % HEROES.length) + HEROES.length) % HEROES.length]!;

/** Hero of a player; `players` must be in join order (that's how the store keeps them). */
export function heroOf(players: readonly { playerId: string }[], playerId: string): Hero {
  const i = players.findIndex((p) => p.playerId === playerId);
  return heroForIndex(i < 0 ? 0 : i);
}

/**
 * Native x (320 px wide scene) of the chef at `joinIndex` when `count` chefs stand behind the counter:
 * a row spaced 31 px, centred (10 chefs fill the counter from x = 20 to x = 299).
 */
export const chefX = (joinIndex: number, count = MAX_CHEFS) => Math.floor(160 + (joinIndex - (count - 1) / 2) * 31);
