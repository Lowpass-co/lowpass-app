/* ============================================
   LOWPASS — Advance: sections that only show sometimes (Nov 2026, Adam:
   Weather & Outdoor "only if show is outdoor!")

   A section may carry `show_when: { field, in }` — it shows only once the
   question `field` (wherever it sits on the day) is answered with one of
   `in`. Unanswered → hidden. Pure; the show page, the board's counts and the
   venue form all ask the same function.
   ============================================ */

import type { AdvData, ShowWhen } from './board';

interface S {
  template_id: string;
  fields?: { id: string }[];
  show_when?: ShowWhen | null;
}

/** The answer to question `fieldId` on this day (first section that has it). */
export function answerFor(fieldId: string, sections: readonly S[], data: AdvData | null | undefined): unknown {
  for (const s of sections) {
    if ((s.fields ?? []).some((f) => f.id === fieldId)) return data?.[s.template_id]?.[fieldId];
  }
  return undefined;
}

export function sectionShown(section: S, sections: readonly S[], data: AdvData | null | undefined): boolean {
  const w = section.show_when;
  if (!w || typeof w.field !== 'string' || !Array.isArray(w.in)) return true;
  const v = answerFor(w.field, sections, data);
  if (typeof v !== 'string') return false;
  const want = v.trim().toLowerCase();
  return w.in.some((o) => o.trim().toLowerCase() === want);
}

export function shownSections<T extends S>(sections: readonly T[], data: AdvData | null | undefined): T[] {
  return sections.filter((s) => sectionShown(s, sections, data));
}

/** A stored condition, or null — the gate for anything read from JSON. */
export function parseShowWhen(raw: unknown): ShowWhen | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { field?: unknown; in?: unknown };
  if (typeof r.field !== 'string' || !r.field.trim() || r.field.length > 80 || !Array.isArray(r.in)) return null;
  const vals = r.in.filter((x): x is string => typeof x === 'string' && x.length <= 120).slice(0, 20);
  return vals.length ? { field: r.field, in: vals } : null;
}
