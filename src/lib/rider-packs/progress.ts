/* ============================================
   LOWPASS — Rider · completion progress (§RA11)

   Canonical, PURE (no React / no 'use client') section-completion math,
   shared by the server (GET /api/rider-packs progress aggregate) and
   client surfaces (RiderPackHeader stats, RiderShowRightRail navigator).

   Status resolution: an explicit rider_sections.status (migration 111)
   wins; otherwise it's derived from field-fill. `needs_review` only ever
   comes from an explicit status — it can't be inferred from fill.
   ============================================ */

import type { Field, RiderSection, SectionType } from './types';

export type RiderSectionStatus = 'not_started' | 'in_progress' | 'complete' | 'needs_review';

/** Pure, server-safe mirror of FieldEditors.isFieldConsideredEmpty
 *  (that one lives in a 'use client' module, so it can't be imported
 *  server-side). Keep the two in sync. */
export function isFieldEmpty(field: Field): boolean {
  switch (field.type) {
    case 'text':
      return !(field.value && field.value.trim());
    case 'url':
      return !(field.href && field.href.trim());
    case 'time':
      return !(field.value && field.value.trim());
    case 'currency':
      return field.amount === 0 && field.currency === 'USD';
    case 'number':
      return field.value === 0 && !(field.unit && field.unit.trim());
    case 'table':
      return (field.rows?.length ?? 0) === 0;
    case 'contact':
      return (field.entries?.length ?? 0) === 0;
    case 'asset':
      return !field.asset_id;
    case 'checkbox_list':
      return (field.items?.length ?? 0) === 0;
    default:
      return false;
  }
}

/** Minimal section shape this module needs (so it works on raw rows too). */
export type SectionLike = {
  fields?: Field[] | null;
  section_type?: SectionType | null;
  status?: string | null;
};

/** Resolve a section's status — explicit DB status first, else derived. */
export function sectionStatus(section: SectionLike): RiderSectionStatus {
  const explicit = section.status;
  if (
    explicit === 'needs_review' ||
    explicit === 'complete' ||
    explicit === 'in_progress' ||
    explicit === 'not_started'
  ) {
    return explicit;
  }
  // Only 'fields' sections can be derived; others have no field list here.
  if ((section.section_type ?? 'fields') !== 'fields') return 'not_started';
  const fields = section.fields ?? [];
  if (fields.length === 0) return 'not_started';
  const filled = fields.filter((f) => !isFieldEmpty(f)).length;
  if (filled === 0) return 'not_started';
  return filled === fields.length ? 'complete' : 'in_progress';
}

/** Filled/total field counts for a section (0/0 for non-field sections). */
export function sectionFillCounts(section: SectionLike): { filled: number; total: number } {
  if ((section.section_type ?? 'fields') !== 'fields') return { filled: 0, total: 0 };
  const fields = section.fields ?? [];
  return { filled: fields.filter((f) => !isFieldEmpty(f)).length, total: fields.length };
}

export interface RiderProgress {
  sectionsTotal: number;
  sectionsComplete: number;
  inProgressCount: number;
  needsReviewCount: number;
}

/** Roll section statuses up into the RiderPackHeader stat shape. */
export function computeRiderProgress(sections: SectionLike[]): RiderProgress {
  let sectionsComplete = 0;
  let inProgressCount = 0;
  let needsReviewCount = 0;
  for (const s of sections) {
    const st = sectionStatus(s);
    if (st === 'complete') sectionsComplete += 1;
    else if (st === 'in_progress') inProgressCount += 1;
    else if (st === 'needs_review') needsReviewCount += 1;
  }
  return { sectionsTotal: sections.length, sectionsComplete, inProgressCount, needsReviewCount };
}

/** Convenience for callers holding full RiderSection rows. */
export function computeRiderProgressForSections(sections: RiderSection[]): RiderProgress {
  return computeRiderProgress(sections);
}
