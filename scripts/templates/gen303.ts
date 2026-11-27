/* Writes database/migrations/303_advance_catalog_curated.sql from the
   catalogue (src/lib/templates/advanceCatalog.ts). Run: npx tsx scripts/templates/gen303.ts */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { advanceCatalogSql } from '../../src/lib/templates/advanceCatalogSql';

const out = join(process.cwd(), 'database/migrations/303_advance_catalog_curated.sql');
writeFileSync(out, advanceCatalogSql());
console.log(`wrote ${out}`);
