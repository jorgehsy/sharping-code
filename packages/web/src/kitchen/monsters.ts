export type Difficulty = 'easy' | 'medium' | 'hard';

export const MONSTERS: Record<Difficulty, readonly string[]> = {
  easy: ['tiny_zombie', 'goblin', 'imp', 'skelet'],
  medium: ['chort', 'masked_orc', 'orc_warrior', 'wogol'],
  hard: ['big_demon', 'ogre', 'big_zombie'],
};

export const ALL_MONSTERS = [...MONSTERS.easy, ...MONSTERS.medium, ...MONSTERS.hard] as const;

/** FNV-1a: tiny, stable across runs and platforms. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Same order always gets the same monster (every client agrees), and its size matches the difficulty. */
export function monsterFor(orderId: string, difficulty: Difficulty): string {
  const list = MONSTERS[difficulty] ?? MONSTERS.easy;
  return list[hashString(orderId) % list.length]!;
}
