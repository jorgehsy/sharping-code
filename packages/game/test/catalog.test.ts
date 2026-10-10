import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { buildCatalogSource, CATALOG_FILE } from '../../../scripts/catalog.ts';
import { getPuzzle, PUZZLES } from '../src/catalog.ts';

describe('catalog', () => {
  it('generated file is in sync with puzzles/ (run `pnpm gen:catalog`)', async () => {
    expect(await readFile(CATALOG_FILE, 'utf8')).toBe(await buildCatalogSource());
  });

  it('exposes puzzles by id with statement and cases', () => {
    expect(PUZZLES.length).toBeGreaterThan(0);
    const p = getPuzzle('suma-de-pares')!;
    expect(p.statement).toContain('suma de todos los números pares');
    expect(p.cases.hidden.length).toBeGreaterThan(0);
    expect(getPuzzle('nope')).toBeUndefined();
  });
});
