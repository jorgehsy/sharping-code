import { readdir, readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { PuzzleCases, PuzzleMeta } from '@sharping/shared';
import { buildCatalogSource, CATALOG_FILE } from './catalog.ts';

const root = join(import.meta.dirname, '..', 'puzzles');

const parseFrontmatter = (md: string): unknown => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(md);
  if (!m) throw new Error('puzzle.md: missing YAML frontmatter');
  return parse(m[1]!);
};

const fmt = (v: unknown) => JSON.stringify(v);

async function validate(dir: string): Promise<string[]> {
  const errors: string[] = [];
  const base = join(root, dir);

  const meta = PuzzleMeta.safeParse(parseFrontmatter(await readFile(join(base, 'puzzle.md'), 'utf8')));
  if (!meta.success) return [`puzzle.md: ${meta.error.message}`];
  if (meta.data.id !== dir) errors.push(`id "${meta.data.id}" != folder name "${dir}"`);

  const cases = PuzzleCases.safeParse(JSON.parse(await readFile(join(base, 'cases.json'), 'utf8')));
  if (!cases.success) return [...errors, `cases.json: ${cases.error.message}`];

  const mod = (await import(pathToFileURL(join(base, 'solution.ts')).href)) as { solve?: unknown };
  if (typeof mod.solve !== 'function') return [...errors, 'solution.ts: missing `solve` export'];
  const solve = mod.solve as (...args: unknown[]) => unknown;

  const all = [
    ...cases.data.public.map((c) => ({ ...c, kind: 'public' })),
    ...cases.data.hidden.map((c) => ({ ...c, kind: 'hidden' })),
  ];
  for (const [i, c] of all.entries()) {
    try {
      const actual = solve(...c.input);
      if (!isDeepStrictEqual(actual, c.output))
        errors.push(`${c.kind} case ${i}: input ${fmt(c.input)} expected ${fmt(c.output)} got ${fmt(actual)}`);
    } catch (e) {
      errors.push(`${c.kind} case ${i}: threw ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return errors;
}

const dirs = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
let failed = 0;
for (const dir of dirs) {
  let errors: string[];
  try {
    errors = await validate(dir);
  } catch (e) {
    errors = [e instanceof Error ? e.message : String(e)];
  }
  if (errors.length === 0) console.log(`PASS ${dir}`);
  else {
    failed++;
    console.log(`FAIL ${dir}`);
    for (const err of errors) console.log(`  - ${err}`);
  }
}
if ((await readFile(CATALOG_FILE, 'utf8').catch(() => '')) !== (await buildCatalogSource())) {
  failed++;
  console.log('FAIL catalog: packages/game/src/catalog.generated.ts is stale, run `pnpm gen:catalog`');
}
console.log(`\n${dirs.length - failed}/${dirs.length} puzzles OK`);
process.exit(failed ? 1 : 0);
