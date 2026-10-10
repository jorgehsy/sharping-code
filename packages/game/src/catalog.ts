import type { PuzzleCases, PuzzleMeta } from '@sharping/shared';
import { PUZZLES } from './catalog.generated.ts';

/** A puzzle as bundled into the Lambdas (generated from `puzzles/`). Includes hidden cases: never send as is to clients. */
export interface CatalogPuzzle extends PuzzleMeta {
  /** Markdown body of puzzle.md. */
  statement: string;
  cases: PuzzleCases;
}

export { PUZZLES };

export const getPuzzle = (id: string): CatalogPuzzle | undefined => PUZZLES.find((p) => p.id === id);

export type PuzzleRef = Pick<CatalogPuzzle, 'id' | 'title' | 'difficulty'>;
