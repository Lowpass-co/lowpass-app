/* ============================================================
   LOWPASS — Advance intake (Send Packet → venue) helpers · T3

   Pure, dependency-free logic shared by the authenticated create
   route, the public venue form, and the public submit route:

     - buildIntakeFormSchema: derive the venue-facing field list from
       an advance instance's section templates (drops tm_only sections
       and read-only / non-fillable field types).
     - mergeIntakeIntoAdvance: deep-merge the venue's answers back into
       advance_instances.data (venue is authoritative for the fields it
       actually answered; blanks never clobber existing values).

   Token generation reuses generateToken() from rider-packs/web-links
   at the route layer — no separate token util here.
   ============================================================ */

/** advance_instances.data shape: { sectionTemplateId: { fieldId: value } }. */
export type AdvanceData = Record<string, Record<string, unknown>>;

export type IntakeFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'date'
  | 'time'
  | 'url'
  | 'dropdown'
  | 'select'
  | 'boolean'
  | 'checkbox'
  | 'contact'
  | 'file'
  | string;

export interface IntakeField {
  id: string;
  label: string;
  type: IntakeFieldType;
  required?: boolean;
  options?: string[];
  helpText?: string;
  placeholder?: string;
}

export interface IntakeSection {
  template_id: string;
  label: string;
  fields: IntakeField[];
  order?: number;
  tm_only?: boolean;
}

export interface IntakeFormSchema {
  sections: {
    template_id: string;
    label: string;
    fields: IntakeField[];
  }[];
}

/** Field types a venue can't meaningfully fill on a public form. File
 *  uploads + structured contact cards are excluded from intake v1. */
const NON_FILLABLE_TYPES = new Set(['file', 'contact']);

/**
 * Build the venue-facing form from the advance instance's sections.
 * Drops tm_only sections (internal) and non-fillable field types, and
 * omits any section left with no fillable fields. Order is preserved.
 */
export function buildIntakeFormSchema(
  sections: IntakeSection[] | null | undefined,
): IntakeFormSchema {
  const out: IntakeFormSchema['sections'] = [];
  const sorted = [...(sections ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  for (const section of sorted) {
    if (section.tm_only) continue;
    const fields = (section.fields ?? []).filter(
      (f) => !NON_FILLABLE_TYPES.has(f.type),
    );
    if (fields.length === 0) continue;
    out.push({
      template_id: section.template_id,
      label: section.label,
      fields: fields.map((f) => ({
        id: f.id,
        label: f.label,
        type: f.type,
        required: f.required ?? false,
        options: Array.isArray(f.options) ? f.options : undefined,
        helpText: typeof f.helpText === 'string' ? f.helpText : undefined,
        placeholder:
          typeof f.placeholder === 'string' ? f.placeholder : undefined,
      })),
    });
  }
  return { sections: out };
}

/** True if a submitted value is effectively empty (so it never clobbers
 *  an existing answer during merge). */
export function isEmptyAnswer(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Deep-merge the venue's submission into advance_instances.data. The
 * venue is authoritative for fields it actually answered — a non-empty
 * submitted value overwrites the existing one (the whole point of the
 * intake is to get the venue's real specs). Empty answers are skipped
 * so a venue leaving a field blank never wipes a value the TM entered.
 * Pure — returns a new object, mutates nothing.
 */
export function mergeIntakeIntoAdvance(
  existing: AdvanceData | null | undefined,
  submitted: AdvanceData | null | undefined,
): AdvanceData {
  const out: AdvanceData = {};
  for (const [sectionId, fields] of Object.entries(existing ?? {})) {
    out[sectionId] = { ...(fields ?? {}) };
  }
  if (!submitted) return out;
  for (const [sectionId, fields] of Object.entries(submitted)) {
    if (!fields || typeof fields !== 'object') continue;
    const merged: Record<string, unknown> = { ...(out[sectionId] ?? {}) };
    for (const [fieldId, value] of Object.entries(fields)) {
      if (isEmptyAnswer(value)) continue;
      merged[fieldId] = value;
    }
    out[sectionId] = merged;
  }
  return out;
}

/**
 * Filter a raw venue submission down to fields that actually exist in
 * the form schema — defence against a tampered public POST trying to
 * write arbitrary keys into advance_instances.data.
 */
export function sanitizeSubmission(
  schema: IntakeFormSchema,
  raw: AdvanceData | null | undefined,
): AdvanceData {
  const allowed = new Map<string, Set<string>>();
  for (const s of schema.sections) {
    allowed.set(s.template_id, new Set(s.fields.map((f) => f.id)));
  }
  const out: AdvanceData = {};
  for (const [sectionId, fields] of Object.entries(raw ?? {})) {
    const allowedFields = allowed.get(sectionId);
    if (!allowedFields || !fields || typeof fields !== 'object') continue;
    const clean: Record<string, unknown> = {};
    for (const [fieldId, value] of Object.entries(fields)) {
      if (allowedFields.has(fieldId)) clean[fieldId] = value;
    }
    if (Object.keys(clean).length > 0) out[sectionId] = clean;
  }
  return out;
}
