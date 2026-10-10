import { writeFile } from 'node:fs/promises';
import { buildCatalogSource, CATALOG_FILE } from './catalog.ts';

await writeFile(CATALOG_FILE, await buildCatalogSource());
console.log(`wrote ${CATALOG_FILE}`);
