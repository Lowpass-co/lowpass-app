/* ============================================
   LOWPASS — Tour templates (Nov 2026, Adam)

   What a new tour can start from. Pure: no I/O, so the rules are pinned by
   tests and the seed migration (280) is checked against these lists.

   BUDGET — one template per scale of tour: Support tour · Club · Theatre ·
   Arena · Stadium · Press tour. Every one uses the skeleton of Adam's own
   Sheets budgets (Salaries · Per diem · Hotels · Transport · Production), with
   the lines that scale actually spends on.
     Salaries, Per Diems and Hotels carry NO lines on purpose: those lines are
     written automatically from Payroll and Hotels & rooming
     (reconcileDerivedBudgetLines). The template only gives them a section to
     land in. Flights are left off for the same reason (they come from Travel).

   MONEY — asked when the tour is created. Anything left blank is 0%. Insurance,
   contingency and merch COG come with suggestions.

   ADVANCE — four starter question sets built from the question catalog
   (advance_templates): Headline show day, Support show day, Festival day,
   Day off. A tour chooses which its show days use and whether its days off
   get an advance.
   ============================================ */

import type { AdvSection } from '@/lib/advance/board';

/* ---------------------------------------------------------------- budget */

export interface BudgetTemplateDef {
  /** Unique system template name (budget_templates.name WHERE is_system). */
  name: string;
  tier: string;
  description: string;
  /** Advance starter its show days default to (null = none). */
  advanceShow: AdvanceStarterKey | null;
  sections: { name: string; lines: string[] }[];
}

/** Sections whose lines are written automatically — never seeded with lines. */
const AUTO_SECTIONS = [
  { name: 'Salaries', lines: [] as string[] },
  { name: 'Per Diems', lines: [] as string[] },
  { name: 'Hotels', lines: [] as string[] },
];

export const BUDGET_TEMPLATES: BudgetTemplateDef[] = [
  {
    name: 'Support tour',
    tier: 'support',
    description: 'Opening for another artist. Van or splitter, a small crew.',
    advanceShow: 'support',
    sections: [
      ...AUTO_SECTIONS,
      { name: 'Transport', lines: ['Van hire', 'Fuel', 'Parking', 'Tolls & vignettes', 'Ferries & crossings', 'Taxis', 'Travel agent'] },
      { name: 'Production', lines: ['Backline hire', 'Equipment & consumables', 'Freight & excess baggage', 'Misc'] },
    ],
  },
  {
    name: 'Club',
    tier: 'club',
    description: 'Headlining clubs, up to about 1,000 cap. Van and trailer, TM/FOH and merch.',
    advanceShow: 'headline',
    sections: [
      ...AUTO_SECTIONS,
      { name: 'Transport', lines: ['Van & trailer hire', 'Fuel', 'Parking', 'Tolls & vignettes', 'Ferries & crossings', 'Taxis', 'Travel agent'] },
      { name: 'Production', lines: ['Audio & backline hire', 'Equipment & consumables', 'Freight & excess baggage', 'Set & wardrobe', 'Misc'] },
    ],
  },
  {
    name: 'Theatre',
    tier: 'theatre',
    description: 'Theatres and big rooms, 1,000–5,000. Sleeper bus or van, a small crew, a floor lighting package.',
    advanceShow: 'headline',
    sections: [
      ...AUTO_SECTIONS,
      { name: 'Transport', lines: ['Bus', 'Trailer', 'Fuel', 'Parking', 'Taxis', 'Misc transport', 'Travel agent'] },
      {
        name: 'Production',
        lines: ['Audio & backline hire', 'Lighting hire', 'Programming + set-up', 'Freight, cartage & baggage', 'Equipment purchase', 'Set & wardrobe', 'Production rehearsals', 'Misc'],
      },
    ],
  },
  {
    name: 'Arena',
    tier: 'arena',
    description: 'Arenas, 5,000–20,000. Buses and trucks, full production.',
    advanceShow: 'headline',
    sections: [
      ...AUTO_SECTIONS,
      { name: 'Transport', lines: ['Buses', 'Trucking', 'Fuel', 'Parking', 'Taxis & ground transport', 'Misc transport', 'Travel agent'] },
      {
        name: 'Production',
        lines: [
          'Audio hire', 'Lighting hire', 'Video hire', 'Backline hire', 'Rigging & motors', 'Set & staging', 'SFX & pyro',
          'Programming + set-up', 'Production rehearsals', 'Freight & shipping', 'Carnets & customs', 'Tour catering',
          'Equipment purchase', 'Wardrobe', 'Misc',
        ],
      },
    ],
  },
  {
    name: 'Stadium',
    tier: 'stadium',
    description: 'Stadiums and major outdoor shows. Fleets of buses and trucks, steel, video, sea and air freight.',
    advanceShow: 'headline',
    sections: [
      ...AUTO_SECTIONS,
      { name: 'Transport', lines: ['Buses', 'Trucking', 'Charter flights', 'Fuel', 'Parking', 'Taxis & ground transport', 'Misc transport', 'Travel agent'] },
      {
        name: 'Production',
        lines: [
          'Audio hire', 'Lighting hire', 'Video & screens', 'Backline hire', 'Rigging & motors', 'Set & staging', 'Steel & stage system',
          'SFX & pyro', 'Programming + set-up', 'Production rehearsals', 'Sea & air freight', 'Carnets & customs', 'Tour catering',
          'Security', 'Advance & site visits', 'Equipment purchase', 'Wardrobe', 'Misc',
        ],
      },
    ],
  },
  {
    name: 'Press tour',
    tier: 'press',
    description: 'Promo, radio and TV days. Travel, hotels and glam — no production.',
    advanceShow: null,
    sections: [
      ...AUTO_SECTIONS,
      { name: 'Transport', lines: ['Trains', 'Cars & drivers', 'Taxis', 'Travel agent'] },
      { name: 'Press & promo', lines: ['Hair & makeup', 'Styling & wardrobe', 'Content & photography', 'Rehearsal / performance space', 'Gifts & hospitality', 'Misc'] },
    ],
  },
];

/** The generic presets migration 200 seeded; retired by migration 280. */
export const RETIRED_SYSTEM_TEMPLATES = ['Club / Support run', 'Headline tour', 'Festival run'];

export interface TemplateRow {
  id: string;
  name: string;
  is_system?: boolean | null;
  retired_at?: string | null;
  sort_order?: number | null;
  [k: string]: unknown;
}

/**
 * The picker's list: retired presets hidden; system templates first in their
 * own order (smallest tour to biggest), then the workspace's own by name.
 */
export function orderTemplates<T extends TemplateRow>(rows: T[]): T[] {
  return rows
    .filter((r) => !r.retired_at)
    .sort((a, b) => {
      if (!!a.is_system !== !!b.is_system) return a.is_system ? -1 : 1;
      const so = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
      return so || String(a.name).localeCompare(String(b.name));
    });
}

/* ----------------------------------------------------------------- money */

export type MoneyKey =
  | 'management' | 'agency' | 'legal' | 'merch_commission'
  | 'accountancy' | 'insurance' | 'contingency' | 'merch_cogs';

export interface MoneyField {
  key: MoneyKey;
  label: string;
  /** What it's a percentage of, in words. */
  of: string;
  /** Suggested value in percent points (shown as a one-tap suggestion). */
  suggest?: number;
}

export const MONEY_FIELDS: MoneyField[] = [
  { key: 'management', label: 'Management', of: 'show income' },
  { key: 'agency', label: 'Agency', of: 'show income' },
  { key: 'legal', label: 'Legal', of: 'all income' },
  { key: 'merch_commission', label: 'Merch commission', of: 'net merch' },
  { key: 'accountancy', label: 'Accountancy', of: 'income' },
  { key: 'insurance', label: 'Insurance', of: 'income', suggest: 3 },
  { key: 'contingency', label: 'Contingency', of: 'expenses', suggest: 2 },
  { key: 'merch_cogs', label: 'Merch cost of goods', of: 'merch sales', suggest: 35 },
];

/** Percent points as typed, by field. Blank / missing = 0. */
export type MoneyInput = Partial<Record<MoneyKey, string | number | null>>;

export interface CommissionWrite {
  label: string;
  /** Fraction (0.15 = 15%). */
  percentage: number;
  basis: string;
  basis_components: string[] | null;
  basis_pre_tax: boolean;
}

export interface MoneyWrites {
  /** budget_settings fractions. */
  settings: { insurance_pct: number; contingency_pct: number; accountancy_pct: number; merch_cogs_pct: number };
  commissions: CommissionWrite[];
}

/**
 * Typed percentages → what gets written. Blank is 0%. A value that isn't a
 * number from 0 to 100 is an error (never quietly turned into 0).
 */
export function moneyToWrites(input: MoneyInput): { ok: true; writes: MoneyWrites } | { ok: false; error: string } {
  const pct: Partial<Record<MoneyKey, number>> = {};
  for (const f of MONEY_FIELDS) {
    const raw = input[f.key];
    if (raw === undefined || raw === null || String(raw).trim() === '') { pct[f.key] = 0; continue; }
    const n = Number(String(raw).replace('%', '').trim());
    if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, error: `${f.label} must be a percentage from 0 to 100` };
    pct[f.key] = n;
  }
  const frac = (k: MoneyKey) => Math.round(((pct[k] ?? 0) / 100) * 1e6) / 1e6;
  return {
    ok: true,
    writes: {
      settings: {
        insurance_pct: frac('insurance'),
        contingency_pct: frac('contingency'),
        accountancy_pct: frac('accountancy'),
        merch_cogs_pct: frac('merch_cogs'),
      },
      // The four rows every one of Adam's budgets carries, in his order.
      commissions: [
        { label: 'Management', percentage: frac('management'), basis: 'gross', basis_components: ['show'], basis_pre_tax: true },
        { label: 'Agency', percentage: frac('agency'), basis: 'gross', basis_components: ['show'], basis_pre_tax: true },
        { label: 'Legal', percentage: frac('legal'), basis: 'gross', basis_components: null, basis_pre_tax: true },
        { label: 'Merch', percentage: frac('merch_commission'), basis: 'net_merch', basis_components: ['merch'], basis_pre_tax: true },
      ],
    },
  };
}

/* --------------------------------------------------------------- advance */

export type AdvanceStarterKey = 'headline' | 'support' | 'festival' | 'day_off';

export interface AdvanceStarterDef {
  key: AdvanceStarterKey;
  name: string;
  /** Question-catalog sections, by name, in order. */
  sections: string[];
}

export const ADVANCE_STARTERS: AdvanceStarterDef[] = [
  {
    key: 'headline',
    name: 'Headline show day',
    sections: [
      'Key Contacts', 'Event Basics', 'Schedule', 'Venue Info', 'Production', 'Bus and Trailer', 'Dressing Rooms', 'Hospitality',
      'Venue Amenities', 'Runner', 'Merch', 'Comps and Ticketing', 'Security', 'Settlement', 'Local Info', 'Documents and Maps',
    ],
  },
  {
    key: 'support',
    name: 'Support show day',
    sections: [
      'Key Contacts', 'Schedule', 'Venue Info', 'Production', 'Personal Vehicle Parking', 'Dressing Rooms', 'Hospitality', 'Merch',
      'Comps and Ticketing', 'Local Info',
    ],
  },
  {
    key: 'festival',
    name: 'Festival day',
    sections: [
      'Key Contacts', 'Event Basics', 'Schedule', 'Production', 'Transport', 'Dressing Rooms', 'Hospitality', 'Security',
      'Comps and Ticketing', 'Airport and Local Distances', 'Outdoor Venue and Final Confirmation', 'Documents and Maps',
    ],
  },
  {
    key: 'day_off',
    name: 'Day off',
    sections: ['Local Info', 'Airport and Local Distances', 'Personal Vehicle Parking', 'Bus and Trailer'],
  },
];

export const starterByKey = (k: string): AdvanceStarterDef | undefined => ADVANCE_STARTERS.find((s) => s.key === k);

/** A question-catalog row (advance_templates, template_type 'section'). */
export interface CatalogSection {
  id: string;
  name: string;
  workspace_id: string | null;
  fields: unknown;
  tm_only?: boolean | null;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * A starter's sections from the catalog. The workspace's own copy of a
 * section wins over the platform one (it's the version you've edited).
 * Sections the catalog doesn't have are reported, not invented.
 */
export function composeStarter(
  starter: AdvanceStarterDef,
  catalog: CatalogSection[],
): { sections: AdvSection[]; missing: string[] } {
  const pick = new Map<string, CatalogSection>();
  for (const row of catalog) {
    const k = norm(row.name);
    const held = pick.get(k);
    if (!held || (held.workspace_id === null && row.workspace_id !== null)) pick.set(k, row);
  }
  const sections: AdvSection[] = [];
  const missing: string[] = [];
  for (const name of starter.sections) {
    const row = pick.get(norm(name));
    if (!row) { missing.push(name); continue; }
    const fields = Array.isArray(row.fields) ? (row.fields as AdvSection['fields']) : [];
    sections.push({
      template_id: row.id,
      label: row.name,
      fields: fields.map((f) => ({ ...f })),
      order: sections.length,
      ...(row.tm_only ? { tm_only: true } : {}),
    });
  }
  return { sections, missing };
}

/* ------------------------------------------------------------ start-from */

export interface StartFromInput {
  /** budget_templates.id, or null for a custom (blank) budget. */
  budgetTemplateId: string | null;
  money: MoneyInput;
  /** Which starter the tour's show days use; null = the workspace setting. */
  advanceShow: AdvanceStarterKey | null;
  /** Give days off an advance (the Day off set). */
  advanceDaysOff: boolean;
}

/** Day type → starter, for a tour's own advance choice. */
export function tourDayStarters(input: Pick<StartFromInput, 'advanceShow' | 'advanceDaysOff'>): Record<string, AdvanceStarterKey> {
  const out: Record<string, AdvanceStarterKey> = {};
  if (input.advanceShow && input.advanceShow !== 'day_off') {
    out.show = input.advanceShow;
    // A festival date on any tour asks festival questions.
    out.festival = 'festival';
  }
  if (input.advanceDaysOff) out.off = 'day_off';
  return out;
}
