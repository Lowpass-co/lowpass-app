/* Writes database/migrations/304_budget_templates_admin.sql from BUDGET_TEMPLATES.
   Run: npx tsx scripts/templates/gen304.ts */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { budgetTemplatesSql } from '../../src/lib/templates/budgetTemplatesSql';

const out = join(process.cwd(), 'database/migrations/304_budget_templates_admin.sql');
writeFileSync(out, budgetTemplatesSql());
console.log(`wrote ${out}`);
