/* ============================================================
   LOWPASS — Intake prefill (P7 · Checkpoint B)

   Build PROPOSALS (not committed answers) for an intake form from two sources:
     (b) the most-recent completed advance at the SAME venue → a direct field-id
         match (same section templates → same field ids). The strong source.
     (a) the canonical venue record (resolveVenue) → a best-effort label-keyword
         match for recognisable venue fields (address / city / capacity / phone).

   Rules: never propose over a field the current advance already answered; the
   prior advance wins over canonical. Confirmed proposals ride the SAME store-
   pending + review path as a venue submission (source 'prefill'). Pure; no I/O.
   ============================================================ */

import type { AdvanceData, IntakeFormSchema } from './intake';

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export interface PrefillProposal {
  section_id: string;
  field_id: string;
  value: unknown;
  source: 'prefill';
  /** Where it came from — shown to the venue AND carried to the TM's review. */
  provenance: string;
}

export interface PrefillResult {
  proposals: PrefillProposal[];
  fillableCount: number;
  prefilledCount: number;
  /** prefilledCount / fillableCount, 0..1. */
  ratio: number;
}

/** The prior same-venue advance's data + a human label ("From your Mar 2026 show
 *  · Spring Tour"). */
export interface PriorAdvanceSource {
  data: AdvanceData;
  label: string;
}

/** Canonical venue values (from resolveVenue), used for the best-effort match. */
export interface CanonicalHints {
  address?: string | null;
  city?: string | null;
  capacity?: number | null;
  phone?: string | null;
}

const CANON_KEYWORDS: { key: keyof CanonicalHints; kw: string[] }[] = [
  { key: 'address', kw: ['address'] },
  { key: 'city', kw: ['city', 'town'] },
  { key: 'capacity', kw: ['capacity'] },
  { key: 'phone', kw: ['phone', 'telephone'] },
];

export function buildPrefillProposals(
  schema: IntakeFormSchema,
  currentData: AdvanceData | null | undefined,
  prior: PriorAdvanceSource | null,
  canonical: CanonicalHints | null,
): PrefillResult {
  const proposals: PrefillProposal[] = [];
  let fillableCount = 0;

  for (const s of schema.sections) {
    for (const f of s.fields) {
      fillableCount += 1;
      // Never propose over an answer the TM already entered.
      if (!isEmpty(currentData?.[s.template_id]?.[f.id])) continue;

      // (b) prior same-venue advance — direct field-id match.
      const pv = prior?.data?.[s.template_id]?.[f.id];
      if (prior && !isEmpty(pv)) {
        proposals.push({ section_id: s.template_id, field_id: f.id, value: pv, source: 'prefill', provenance: prior.label });
        continue;
      }

      // (a) canonical venue — label-keyword match.
      if (canonical) {
        const lbl = (f.label || '').toLowerCase();
        for (const { key, kw } of CANON_KEYWORDS) {
          const cval = canonical[key];
          if (cval != null && cval !== '' && kw.some((k) => lbl.includes(k))) {
            proposals.push({ section_id: s.template_id, field_id: f.id, value: cval, source: 'prefill', provenance: 'From the venue record' });
            break;
          }
        }
      }
    }
  }

  return {
    proposals,
    fillableCount,
    prefilledCount: proposals.length,
    ratio: fillableCount ? proposals.length / fillableCount : 0,
  };
}

/** Proposals → a nested map { sectionId: { fieldId: { value, provenance } } } for
 *  the form to render + the submit to mark source='prefill'. */
export function proposalsToMap(
  proposals: PrefillProposal[],
): Record<string, Record<string, { value: unknown; provenance: string }>> {
  const out: Record<string, Record<string, { value: unknown; provenance: string }>> = {};
  for (const p of proposals) {
    (out[p.section_id] ??= {})[p.field_id] = { value: p.value, provenance: p.provenance };
  }
  return out;
}
