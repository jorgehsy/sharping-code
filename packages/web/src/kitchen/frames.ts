/** Frame rects (x, y, w, h) in /assets/0x72/dungeon.png for the HTML portraits. Copied from dungeon.json. */
export const ATLAS_URL = '/assets/0x72/dungeon.png';
export const ATLAS_SIZE = 512;

export type Rect = readonly [x: number, y: number, w: number, h: number];

export const FRAMES = {
  knight_m_idle_anim_f0: [128, 100, 16, 28],
  elf_f_idle_anim_f0: [128, 4, 16, 28],
  dwarf_m_idle_anim_f0: [128, 292, 16, 28],
  wizzard_f_idle_anim_f0: [128, 132, 16, 28],
  lizard_m_idle_anim_f0: [128, 228, 16, 28],
  knight_f_idle_anim_f0: [128, 68, 16, 28],
  elf_m_idle_anim_f0: [128, 36, 16, 28],
  wizzard_m_idle_anim_f0: [128, 164, 16, 28],
  dwarf_f_idle_anim_f0: [128, 260, 16, 28],
  lizard_f_idle_anim_f0: [128, 196, 16, 28],
  tiny_zombie_idle_anim_f0: [368, 16, 16, 16],
  goblin_idle_anim_f0: [368, 40, 16, 16],
  imp_idle_anim_f0: [368, 64, 16, 16],
  skelet_idle_anim_f0: [368, 88, 16, 16],
  chort_idle_anim_f0: [368, 273, 16, 23],
  masked_orc_idle_anim_f0: [368, 153, 16, 23],
  orc_warrior_idle_anim_f0: [368, 177, 16, 23],
  wogol_idle_anim_f0: [368, 249, 16, 23],
  big_demon_idle_anim_f0: [16, 428, 32, 36],
  ogre_idle_anim_f0: [16, 380, 32, 36],
  big_zombie_idle_anim_f0: [16, 332, 32, 36],
  flask_big_red: [288, 336, 16, 16],
  flask_big_green: [320, 336, 16, 16],
  skull: [288, 432, 16, 16],
} as const satisfies Record<string, Rect>;

export type FrameName = keyof typeof FRAMES;
