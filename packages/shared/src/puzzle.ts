import { z } from 'zod';

export const Difficulty = z.enum(['easy', 'medium', 'hard']);
export type Difficulty = z.infer<typeof Difficulty>;

/** Frontmatter of `puzzles/<id>/puzzle.md`. */
export const PuzzleMeta = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  difficulty: Difficulty,
  author: z.string().min(1),
  signature: z.string().min(1),
  tags: z.array(z.string()).default([]),
  blockedSabotages: z.array(z.string()).default([]),
});
export type PuzzleMeta = z.infer<typeof PuzzleMeta>;

/** `input` is the argument list passed to `solve`. */
export const PuzzleCase = z.object({ input: z.array(z.unknown()), output: z.unknown() });
export type PuzzleCase = z.infer<typeof PuzzleCase>;

/** `puzzles/<id>/cases.json`. */
export const PuzzleCases = z.object({ public: z.array(PuzzleCase).min(1), hidden: z.array(PuzzleCase) });
export type PuzzleCases = z.infer<typeof PuzzleCases>;
