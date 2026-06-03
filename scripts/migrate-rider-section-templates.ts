/* ============================================
   LOWPASS — §RA15 data migration: backfill rider_sections.template_id

   One-time backfill. Existing rider_sections predate the
   rider_section_templates library (migration 111) and have template_id
   NULL. This walks them and links each to the platform template it most
   closely matches (by name, then field overlap). No match → left NULL
   (treated as a custom section).

   Connection: same as scripts/db-migrate.mjs — DATABASE_URL or
   SUPABASE_DB_URL must be set. Requires the `pg` devDep + `tsx`.

   Usage:
     DATABASE_URL=postgres://...  npx tsx scripts/migrate-rider-section-templates.ts            # dry-run (default)
     DATABASE_URL=postgres://...  npx tsx scripts/migrate-rider-section-templates.ts --apply     # write template_id

   Idempotent: only considers sections WHERE template_id IS NULL, so
   re-running skips already-linked rows.

   HALT-AND-REPORT: sections whose `fields` JSONB is not an array are
   surfaced at the end and NEVER auto-assigned — bring those to Adam.
   ============================================ */

import pg from 'pg';

const url = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('ERROR: DATABASE_URL or SUPABASE_DB_URL must be set.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

type TemplateField = { id?: string; label?: string; type?: string };
type PlatformTemplate = { id: string; template_type: string; name: string; fields: TemplateField[] };
type SectionField = { key?: string; label?: string; type?: string };
type SectionRow = {
  id: string;
  section_key: string | null;
  title: string | null;
  section_type: string | null;
  fields: unknown;
};

const norm = (s: string | null | undefined): string =>
  (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Identifier set for a template's fields (ids + labels, normalized). */
function templateIds(t: PlatformTemplate): Set<string> {
  const set = new Set<string>();
  for (const f of t.fields ?? []) {
    if (f.id) set.add(norm(f.id));
    if (f.label) set.add(norm(f.label));
  }
  return set;
}

/** Best matching platform template for a section, or null.
 *  Rule 1: a name/key match wins outright. Rule 2: else the template with
 *  the highest field-identifier overlap, if >= 0.6. */
function bestMatch(
  section: { section_key: string | null; title: string | null; fields: SectionField[] },
  templates: PlatformTemplate[],
): { template: PlatformTemplate; reason: string } | null {
  const nameKeys = [norm(section.title), norm(section.section_key)].filter(Boolean);
  const byName = templates.find(
    (t) => nameKeys.includes(norm(t.name)) || nameKeys.includes(norm(t.template_type)),
  );
  if (byName) return { template: byName, reason: 'name/key match' };

  const sectionIds = new Set<string>();
  for (const f of section.fields) {
    if (f.key) sectionIds.add(norm(f.key));
    if (f.label) sectionIds.add(norm(f.label));
  }
  if (sectionIds.size === 0) return null;

  let best: { template: PlatformTemplate; ratio: number } | null = null;
  for (const t of templates) {
    const tIds = templateIds(t);
    if (tIds.size === 0) continue;
    let hits = 0;
    for (const id of sectionIds) if (tIds.has(id)) hits += 1;
    const ratio = hits / sectionIds.size;
    if (!best || ratio > best.ratio) best = { template: t, ratio };
  }
  if (best && best.ratio >= 0.6) {
    return { template: best.template, reason: `field overlap ${(best.ratio * 100).toFixed(0)}%` };
  }
  return null;
}

async function main() {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  console.log(`\n§RA15 backfill — ${APPLY ? 'APPLY' : 'DRY-RUN'} (use --apply to write)\n`);

  try {
    const { rows: templates } = await client.query<PlatformTemplate>(
      `SELECT id, template_type, name, fields FROM public.rider_section_templates WHERE workspace_id IS NULL`,
    );
    if (templates.length === 0) {
      console.error('No platform templates found — has migration 111 been applied?');
      process.exit(1);
    }
    console.log(`Loaded ${templates.length} platform templates.\n`);

    const { rows: sections } = await client.query<SectionRow>(
      `SELECT id, section_key, title, section_type, fields
         FROM public.rider_sections
        WHERE template_id IS NULL`,
    );

    let matched = 0;
    let unmatched = 0;
    let skippedNonField = 0;
    const incompatible: SectionRow[] = [];

    for (const s of sections) {
      // Only 'fields' sections map to templates; others have no field list.
      if ((s.section_type ?? 'fields') !== 'fields') {
        skippedNonField += 1;
        continue;
      }
      if (!Array.isArray(s.fields)) {
        incompatible.push(s); // HALT-AND-REPORT — never auto-assign
        continue;
      }
      const m = bestMatch(
        { section_key: s.section_key, title: s.title, fields: s.fields as SectionField[] },
        templates,
      );
      if (!m) {
        unmatched += 1;
        console.log(`  • "${s.title ?? s.section_key}" → (no match — left custom)`);
        continue;
      }
      matched += 1;
      console.log(`  ✓ "${s.title ?? s.section_key}" → ${m.template.name}  [${m.reason}]`);
      if (APPLY) {
        await client.query(`UPDATE public.rider_sections SET template_id = $1 WHERE id = $2`, [
          m.template.id,
          s.id,
        ]);
      }
    }

    console.log(
      `\nSummary: ${matched} matched, ${unmatched} unmatched (custom), ` +
        `${skippedNonField} non-field sections skipped, ${incompatible.length} incompatible.`,
    );
    if (incompatible.length > 0) {
      console.log(`\n⚠ INCOMPATIBLE fields shape (NOT assigned — surface to Adam):`);
      for (const s of incompatible) {
        console.log(`    - id=${s.id} title="${s.title ?? s.section_key}" (fields is not an array)`);
      }
    }
    if (!APPLY) console.log(`\nDry-run only. Re-run with --apply to write template_id.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
