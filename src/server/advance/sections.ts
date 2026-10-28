/* ============================================
   A day's section layout — validation for Customise and templates.

   Sections are the user's own question lists, so the check is shape, not
   provenance: ids, labels and types are bounded, field ids unique per
   section, and nothing that isn't a known field type gets in.
   ============================================ */

import type { AdvField, AdvSection } from '@/lib/advance/board';

export const FIELD_TYPES = new Set([
  'text', 'textarea', 'number', 'currency', 'time', 'date', 'boolean', 'checkbox', 'select', 'url', 'email', 'phone',
  'contact', 'file', 'labor_call',
]);

const str = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

export function cleanSections(input: unknown): { sections: AdvSection[] } | { error: string } {
  if (!Array.isArray(input)) return { error: 'sections must be a list' };
  if (input.length > 60) return { error: 'Too many sections' };
  const seen = new Set<string>();
  const out: AdvSection[] = [];
  for (const [i, raw] of input.entries()) {
    const s = raw as Record<string, unknown>;
    if (!s || typeof s !== 'object') return { error: 'Bad section' };
    if (!str(s.template_id, 80)) return { error: 'Each section needs an id' };
    if (!str(s.label, 120)) return { error: 'Each section needs a name' };
    const id = String(s.template_id);
    if (seen.has(id)) return { error: `“${String(s.label)}” is on the day twice` };
    seen.add(id);
    if (!Array.isArray(s.fields) || s.fields.length > 200) return { error: `Bad questions in “${String(s.label)}”` };
    const fids = new Set<string>();
    const fields: AdvField[] = [];
    for (const rf of s.fields) {
      const f = rf as Record<string, unknown>;
      if (!f || !str(f.id, 80) || !str(f.label, 200) || !FIELD_TYPES.has(String(f.type))) {
        return { error: `A question in “${String(s.label)}” is missing its name or type` };
      }
      if (fids.has(String(f.id))) return { error: `Two questions share an id in “${String(s.label)}”` };
      fids.add(String(f.id));
      const field: AdvField = { id: String(f.id), label: String(f.label).trim(), type: String(f.type) };
      if (Array.isArray(f.options)) field.options = f.options.filter((o) => typeof o === 'string' && o.length <= 120).slice(0, 50) as string[];
      if (typeof f.helpText === 'string') field.helpText = f.helpText.slice(0, 500);
      if (typeof f.placeholder === 'string') field.placeholder = f.placeholder.slice(0, 200);
      if (f.required === true) field.required = true;
      if (f.day_only === true) field.day_only = true;
      fields.push(field);
    }
    out.push({ template_id: id, label: String(s.label).trim(), fields, order: i, ...(s.tm_only === true ? { tm_only: true } : {}) });
  }
  return { sections: out };
}

/** For saving a day back into its template: drop the day-only marks. */
export function asTemplateSections(sections: AdvSection[]): AdvSection[] {
  return sections.map((s, i) => ({
    ...s,
    order: i,
    fields: s.fields.map((f) => {
      const copy = { ...f };
      delete copy.day_only;
      return copy;
    }),
  }));
}
