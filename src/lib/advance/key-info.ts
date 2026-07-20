/* ============================================
   LOWPASS — Advance · Key info extractors

   Server-side helpers that pull "Key Contacts" + "Hotel" digest data
   out of an advance instance's filled-out section data. Used by
   AdvanceShowReadView (legacy KeyInfoBlock — about to be removed)
   and AdvanceShowRightRail (Variant parity §B).

   Pure functions — no Supabase, no React. Safe to import anywhere.
   Kept structurally typed so the AdvanceShowReadView's stricter
   FieldDef / SectionDef shapes are assignable.
   ============================================ */

export type SectionField = {
  /** Field UUID — NOT the label. The advance.data is keyed by field.id. */
  id: string;
  type: string;
  label?: string;
};

export type SectionDef = {
  template_id: string;
  label: string;
  fields: SectionField[];
};

export type ContactRow = {
  first_name?: string;
  last_name?: string;
  role?: string;
  phone?: string;
  email?: string;
};

export type HotelKeyInfo = {
  name?: string;
  address?: string;
  checkIn?: string;
  checkOut?: string;
  notes?: string;
};

export type KeyContactCard = {
  name: string;
  role: string;
  phone?: string;
  email?: string;
};

/** Settlement is excluded — its fields are accounting numbers, not
 *  contact / key-info data. */
function sectionsForKeyInfoExtraction(sections: SectionDef[]): SectionDef[] {
  return sections.filter(
    (s) => !(s.label ?? '').toLowerCase().includes('settlement'),
  );
}

function normalizeContactRows(value: unknown): ContactRow[] {
  if (value == null) return [];
  if (Array.isArray(value)) return (value as ContactRow[]).filter(Boolean);
  return [value as ContactRow];
}

export function extractHotelKeyInfo(
  sections: SectionDef[],
  data: Record<string, Record<string, unknown>>,
): HotelKeyInfo | null {
  const pool = sectionsForKeyInfoExtraction(sections);
  const hotelSection = pool.find((s) => {
    const l = (s.label ?? '').toLowerCase();
    return l.includes('hotel') || l.includes('accommodation');
  });
  if (!hotelSection) return null;
  const secData = data[hotelSection.template_id] ?? {};
  const out: HotelKeyInfo = {};
  for (const f of hotelSection.fields) {
    const lab = (f.label ?? '').toLowerCase();
    const raw = secData[f.id];
    if (raw == null) continue;
    const str = typeof raw === 'string' ? raw.trim() : String(raw).trim();
    if (!str) continue;
    if (lab.includes('hotel name') || lab.includes('property name')) out.name = str;
    else if (lab.includes('address')) out.address = str;
    else if (lab.includes('check-in') || lab.includes('check in')) out.checkIn = str;
    else if (lab.includes('check-out') || lab.includes('check out')) out.checkOut = str;
    else if (lab.includes('notes')) out.notes = str;
  }
  if (Object.keys(out).length === 0) return null;
  return out;
}

/**
 * ALL day-of venue contacts from an advance instance — every contact-type field
 * row with a name (promoter rep, venue production, hospitality, runner, …), not
 * just the promoter/venue/production/TM subset extractKeyContacts filters to.
 * The Day surface wants the full venue-side people for the show; role falls back
 * to the field label. Deduped on name|email|phone.
 */
export function extractDayContacts(
  sections: SectionDef[],
  data: Record<string, Record<string, unknown>>,
): KeyContactCard[] {
  const pool = sectionsForKeyInfoExtraction(sections);
  const out: KeyContactCard[] = [];
  const seen = new Set<string>();
  for (const section of pool) {
    const secData = data[section.template_id] ?? {};
    for (const field of section.fields) {
      if (field.type !== 'contact') continue;
      const rows = normalizeContactRows(secData[field.id]);
      for (const c of rows) {
        if (!c || (!c.first_name && !c.last_name)) continue;
        const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
        if (!name) continue;
        const key = `${name.toLowerCase()}|${(c.email ?? '').toLowerCase()}|${(c.phone ?? '').trim()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          name,
          role: (c.role ?? '').trim() || (field.label ?? '').trim() || 'Contact',
          phone: c.phone?.trim() || undefined,
          email: c.email?.trim() || undefined,
        });
      }
    }
  }
  return out;
}

function contactMatchPriority(roleLower: string): number {
  if (roleLower.includes('promoter')) return 0;
  if (roleLower.includes('venue') || roleLower.includes('production')) return 1;
  if (roleLower.includes('tour manager') || /\btm\b/i.test(roleLower)) return 2;
  return 99;
}

export function extractKeyContacts(
  sections: SectionDef[],
  data: Record<string, Record<string, unknown>>,
): KeyContactCard[] {
  const pool = sectionsForKeyInfoExtraction(sections);
  const out: KeyContactCard[] = [];
  const seen = new Set<string>();
  for (const section of pool) {
    const secData = data[section.template_id] ?? {};
    for (const field of section.fields) {
      if (field.type !== 'contact') continue;
      const rows = normalizeContactRows(secData[field.id]);
      for (const c of rows) {
        if (!c || (!c.first_name && !c.last_name)) continue;
        const roleLower = (c.role ?? '').toLowerCase();
        const match =
          roleLower.includes('promoter') ||
          roleLower.includes('venue') ||
          roleLower.includes('production') ||
          roleLower.includes('tour manager') ||
          /\btm\b/i.test(roleLower);
        if (!match) continue;
        const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
        if (!name) continue;
        const key = `${name.toLowerCase()}|${(c.email ?? '').toLowerCase()}|${(c.phone ?? '').trim()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          name,
          role: (c.role ?? '').trim() || 'Contact',
          phone: c.phone?.trim() || undefined,
          email: c.email?.trim() || undefined,
        });
      }
    }
  }
  out.sort((a, b) => {
    const pa = contactMatchPriority(a.role.toLowerCase());
    const pb = contactMatchPriority(b.role.toLowerCase());
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });
  return out;
}
