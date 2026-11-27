/* ============================================
   LOWPASS — read Adam's Google Sheets budget (Nov 2026, Adam)

   "can't see the google sheet budget import… the old version barely worked
   so this is the new one I mean." One import, once, when a tour moves into
   Lowpass. This file is the READING half and is pure: the tabs' values (as
   the Sheets API formats them) in, a plan out. Nothing here writes; the
   apply step turns a reviewed plan into rows through the existing writers.

   Adam's template (Au/Ra, CS, GN budgets all share it): SUMMARY, ROUTING &
   INCOME, HOTELS, FLIGHTS, TRANSPORTATION, PROD & MISC EXPENSES (+ EXPENSE
   RECEIPTS, not read). GN budgets lack TRANSPORTATION — every block is found
   by its HEADING, never by a fixed cell, so a moved row or a missing tab
   reads as "nothing there", not as someone else's numbers.

   Never read: totals, "#DIV/0!", the summary's computed section figures —
   Lowpass works its own totals out.
   ============================================ */

export type SheetTabs = Record<string, string[][]>;

export interface SheetShow {
  /** yyyy-mm-dd */
  date: string;
  dayType: string;
  venue: string | null;
  city: string | null;
  capacity: number | null;
  guarantee: number | null;
  withholdingPct: number | null;
  overage: number | null;
  merch: number | null;
  vip: number | null;
}

export interface SheetLine {
  /** Lowpass budget section it goes in (the review screen can change it). */
  section: string;
  /** The sheet block it came from ("TAXIS", "AUDIO + BACKLINE"). */
  block: string;
  label: string;
  proposed: number;
  actual: number;
  /** Both amounts are 0 — offered unticked. */
  empty: boolean;
}

export interface SheetRate {
  role: string;
  group: 'crew' | 'band';
  showRate: number | null;
  offRate: number | null;
  showDays: number | null;
  offDays: number | null;
  /** The sheet's PROJECTED for the row (rate × days, or a one-off). */
  projected: number;
  /** "Tour Manager | Advance" — Lowpass's separate Advance amount. */
  advance: boolean;
  note: string | null;
  empty: boolean;
}

export interface SheetPerDiem {
  role: string;
  rate: number;
}

export interface SheetFlight {
  /** As written: a name, or "BAND" for an unnamed seat. */
  person: string;
  from: string;
  to: string;
  proposed: number;
  actual: number | null;
  /** Leg number on the row (1 = first column group). */
  leg: number;
}

export interface SheetHotel {
  label: string;
  city: string | null;
  dateIn: string | null;
  dateOut: string | null;
  nights: number | null;
  rooms: number | null;
  proposed: number;
  actual: number | null;
  /** The indented rows under it: "Alex (8) (1)". */
  people: { name: string; nights: number | null; rooms: number | null }[];
}

export interface SheetImportPlan {
  title: string | null;
  shows: SheetShow[];
  lines: SheetLine[];
  commissions: { label: string; pct: number }[];
  overheads: { insurance: number | null; contingency: number | null; accountancy: number | null };
  rates: SheetRate[];
  perDiems: SheetPerDiem[];
  flights: SheetFlight[];
  hotels: SheetHotel[];
  /** Tabs we looked for and didn't find, unreadable dates, etc. */
  notes: string[];
}

/* ── cells ─────────────────────────────────────────────────────────────── */

const clean = (v: unknown): string => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
const norm = (v: unknown): string => clean(v).toUpperCase();

/** "$9,070.00", " $ 4,585.00 ", "-$22,612.61", "(£40)", "$ -" → number;
 *  "", "#DIV/0!", "#REF!", words → null. */
export function money(v: unknown): number | null {
  const t = clean(v);
  if (!t || t.startsWith('#')) return null;
  if (/^[^\d]*-\s*$/.test(t)) return 0; // accounting dash: "$ -"
  const neg = /^\(.*\)$/.test(t) || /^-|^[^\d-]*-/.test(t) || t.includes('−');
  const digits = t.replace(/[^0-9.]/g, '');
  if (!digits || digits === '.' || (digits.match(/\./g) ?? []).length > 1) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

/** "30.0%" → 30, "0%" → 0, "0.3" (a fraction the sheet stored) stays 0.3. */
export function percent(v: unknown): number | null {
  const t = clean(v);
  if (!t || t.startsWith('#')) return null;
  const n = Number(t.replace(/[%\s,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

const count = (v: unknown): number | null => {
  const t = clean(v).replace(/[()]/g, '');
  if (!t || t.startsWith('#')) return null;
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', SEPT: '09', OCT: '10', NOV: '11', DEC: '12',
};

/** "27-Nov-2026", "27 Nov 2026", "2026-11-27", "27/11/2026" (day first —
 *  Adam's sheets are UK-formatted) → yyyy-mm-dd; anything else → null. */
export function sheetDate(v: unknown): string | null {
  const t = clean(v);
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[-\s]([A-Za-z]{3,4})[-\s,]*(\d{4})$/);
  if (m && MONTHS[m[2].toUpperCase()]) return `${m[3]}-${MONTHS[m[2].toUpperCase()]}-${m[1].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m && Number(m[2]) <= 12) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/** A tab by name, case / spacing / "&"-"AND" insensitive. */
function tab(tabs: SheetTabs, ...names: string[]): string[][] | null {
  const key = (s: string) => s.toUpperCase().replace(/&/g, 'AND').replace(/[^A-Z]/g, '');
  const wanted = names.map(key);
  for (const [name, rows] of Object.entries(tabs)) if (wanted.includes(key(name))) return rows;
  return null;
}

const isTotal = (v: unknown) => /^TOTAL/.test(norm(v));

/* ── ROUTING & INCOME ──────────────────────────────────────────────────── */

function readShows(rows: string[][], notes: string[]): SheetShow[] {
  const h = rows.findIndex((r) => r.some((c) => norm(c) === 'DATE') && r.some((c) => norm(c) === 'DAY TYPE'));
  if (h < 0) {
    notes.push('Routing & Income: no DATE / DAY TYPE header row.');
    return [];
  }
  const head = rows[h].map(norm);
  const col = (...starts: string[]) => head.findIndex((c) => starts.some((s) => c.startsWith(s)));
  const C = {
    date: col('DATE'),
    type: col('DAY TYPE'),
    venue: col('VENUE'),
    city: col('CITY'),
    cap: col('CAP'),
    guarantee: col('PRE-TX GUARANTEE', 'PRE TAX GUARANTEE', 'GUARANTEE'),
    wh: col('WITHOLDING', 'WITHHOLDING'),
    overage: col('PRE-TX OVERAGE', 'PRE TAX OVERAGE', 'OVERAGE'),
    merch: col('MERCH'),
    vip: col('VIP'),
  };
  const at = (r: string[], i: number) => (i >= 0 ? r[i] : undefined);
  const out: SheetShow[] = [];
  for (const r of rows.slice(h + 1)) {
    if (r.every((c) => !clean(c))) {
      if (out.length > 0) break; // the block ends at its first blank row
      continue;
    }
    if (isTotal(r[0])) break;
    const raw = clean(at(r, C.date));
    const date = sheetDate(raw);
    if (!date) {
      if (raw) notes.push(`Routing & Income: couldn’t read the date “${raw}”.`);
      continue;
    }
    const text = (i: number) => {
      const t = clean(at(r, i));
      return t && t !== '-' ? t : null;
    };
    out.push({
      date,
      dayType: norm(at(r, C.type)) || 'SHOW',
      venue: text(C.venue),
      city: text(C.city),
      capacity: count(at(r, C.cap)),
      guarantee: money(at(r, C.guarantee)),
      withholdingPct: percent(at(r, C.wh)),
      overage: money(at(r, C.overage)),
      merch: money(at(r, C.merch)),
      vip: money(at(r, C.vip)),
    });
  }
  return out;
}

/* ── TRANSPORTATION / PROD & MISC: side-by-side blocks ─────────────────── */

/** Where each sheet block goes in Lowpass. Unknown blocks keep their tab's
 *  default; the review screen can move any line. */
const BLOCK_SECTION: Record<string, string> = {
  'BUS + TRUCK': 'Transport',
  TAXIS: 'Transport',
  'MISC TRANSPORT': 'Transport',
  FUEL: 'Transport',
  PARKING: 'Transport',
  'TRAVEL AGENT': 'Transport',
  'AUDIO + BACKLINE': 'Production',
  LIGHTING: 'Production',
  'PROGRAMMING + SET-UP': 'Production',
  'SET + WARDROBE': 'Production',
  'FREIGHT + BAGGAGE': 'Production',
  'EQUIPMENT PURCHASES': 'Production',
  'MISC PROD': 'Misc',
};

/** A block header: a heading with "#" in the next cell (the template's
 *  "LABEL | # | PROPOSED | ACTUAL/COST"). */
function readBlocks(rows: string[][], fallbackSection: string): SheetLine[] {
  const out: SheetLine[] = [];
  // Every block's columns, found by its header; a header row can hold several.
  const open: { col: number; block: string }[] = [];
  for (const r of rows) {
    // New headers on this row close whatever was open in the same column.
    let headerRow = false;
    r.forEach((c, i) => {
      if (clean(c) && clean(r[i + 1]) === '#') {
        headerRow = true;
        const at = open.findIndex((b) => b.col === i);
        const block = { col: i, block: norm(c) };
        if (at >= 0) open[at] = block;
        else open.push(block);
      }
    });
    if (headerRow) continue;
    for (const b of open) {
      const label = clean(r[b.col]);
      if (!label || isTotal(label)) continue;
      const proposed = money(r[b.col + 2]) ?? 0;
      const actual = money(r[b.col + 3]) ?? 0;
      out.push({
        section: BLOCK_SECTION[b.block] ?? fallbackSection,
        block: b.block,
        label,
        proposed,
        actual,
        empty: proposed === 0 && actual === 0,
      });
    }
  }
  return out;
}

/* ── SUMMARY: commissions, overheads, salaries, per diems ──────────────── */

function readSummary(rows: string[][], plan: SheetImportPlan) {
  // Commissions: a "COMMISSIONS" heading NOT in the first column (the first
  // column's COMMISSIONS is the computed section total), then label | % rows.
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i].findIndex((v, j) => j > 0 && norm(v) === 'COMMISSIONS');
    if (c < 0) continue;
    for (const r of rows.slice(i + 1, i + 12)) {
      const label = clean(r[c]);
      const pct = percent(r[c + 1]);
      if (!label) {
        if (norm(r[c + 1]) === 'TOTAL') break;
        continue;
      }
      if (pct != null && /%/.test(clean(r[c + 1]))) plan.commissions.push({ label, pct });
    }
    break;
  }

  // Overheads: "INSURANCE (3%)", "Contingency (2%)", "ACCOUNTANCY (0% for now)".
  for (const r of rows) {
    const m = clean(r[0]).match(/^(ACCOUNTANCY|INSURANCE|CONTINGENCY)\b.*?\((\d+(?:\.\d+)?)\s*%/i);
    if (m) plan.overheads[m[1].toLowerCase() as 'insurance' | 'contingency' | 'accountancy'] = Number(m[2]);
  }

  // Salary blocks ("SALARY CREW", "SALARY BAND") and the PER DIEM block.
  let mode: 'crew' | 'band' | 'perdiem' | null = null;
  for (const r of rows) {
    const first = norm(r[0]);
    const rest = r.slice(1).some((c) => clean(c));
    if (first.startsWith('SALARY')) {
      mode = first.includes('BAND') ? 'band' : 'crew';
      continue;
    }
    if (first === 'PER DIEM' && !rest) {
      mode = 'perdiem';
      continue;
    }
    if (mode && first && !rest) {
      mode = null; // the next section heading (HOTELS, TRANSPORTATION…)
      continue;
    }
    if (!mode || !first) continue; // blank first cell = the block's total row
    if (mode === 'perdiem') {
      const rate = money(r[2]);
      if (rate != null && rate > 0) plan.perDiems.push({ role: clean(r[0]), rate });
      continue;
    }
    const role = clean(r[0]);
    const projected = money(r[5]) ?? 0;
    const showRate = money(r[1]);
    const offRate = money(r[2]);
    plan.rates.push({
      role,
      group: mode,
      showRate,
      offRate,
      showDays: count(r[3]),
      offDays: count(r[4]),
      projected,
      advance: /\badvance\b/i.test(role),
      note: clean(r[8]) || null,
      empty: projected === 0 && !showRate && !offRate,
    });
  }
}

/* ── FLIGHTS: NAME | # | (FROM TO PROPOSED ACTUAL) × n ─────────────────── */

function readFlights(rows: string[][]): SheetFlight[] {
  const h = rows.findIndex((r) => norm(r[0]) === 'NAME' && r.some((c) => norm(c) === 'FROM'));
  if (h < 0) return [];
  const starts = rows[h].map(norm).flatMap((c, i) => (c === 'FROM' ? [i] : []));
  const out: SheetFlight[] = [];
  for (const r of rows.slice(h + 1)) {
    const person = clean(r[0]);
    if (!person || isTotal(person)) continue;
    starts.forEach((s, leg) => {
      const from = clean(r[s]).toUpperCase();
      const to = clean(r[s + 1]).toUpperCase();
      if (!from || !to) return;
      out.push({ person, from, to, proposed: money(r[s + 2]) ?? 0, actual: money(r[s + 3]), leg: leg + 1 });
    });
  }
  return out;
}

/* ── HOTELS ───────────────────────────────────────────────────────────── */

function readHotels(rows: string[][]): SheetHotel[] {
  const h = rows.findIndex((r) => r.some((c) => norm(c) === 'DATE IN') && r.some((c) => norm(c) === 'PROJECTED'));
  if (h < 0) return [];
  const head = rows[h].map(norm);
  const C = {
    in: head.indexOf('DATE IN'),
    out: head.indexOf('DATE OUT'),
    city: head.indexOf('CITY'),
    accom: head.indexOf('ACCOM'),
    nights: head.findIndex((c) => c.includes('NIGHTS')),
    rooms: head.findIndex((c) => c.includes('ROOMS')),
    proposed: head.indexOf('PROJECTED'),
    actual: head.indexOf('ACTUAL'),
  };
  const out: SheetHotel[] = [];
  for (const r of rows.slice(h + 1)) {
    if (r.some((c) => isTotal(c))) break;
    const proposed = C.proposed >= 0 ? money(r[C.proposed]) : null;
    const accom = C.accom >= 0 ? clean(r[C.accom]) : '';
    if (proposed != null && proposed !== 0) {
      const first = clean(r[0]);
      out.push({
        label: [first, accom && accom !== '-' ? accom : ''].filter(Boolean).join(' — ') || 'Hotel',
        city: C.city >= 0 ? clean(r[C.city]) || null : null,
        dateIn: C.in >= 0 ? sheetDate(r[C.in]) : null,
        dateOut: C.out >= 0 ? sheetDate(r[C.out]) : null,
        nights: C.nights >= 0 ? count(r[C.nights]) : null,
        rooms: C.rooms >= 0 ? count(r[C.rooms]) : null,
        proposed,
        actual: C.actual >= 0 ? money(r[C.actual]) : null,
        people: [],
      });
    } else if (accom && out.length > 0) {
      out[out.length - 1].people.push({
        name: accom,
        nights: C.nights >= 0 ? count(r[C.nights]) : null,
        rooms: C.rooms >= 0 ? count(r[C.rooms]) : null,
      });
    }
  }
  return out;
}

/* ── the plan ─────────────────────────────────────────────────────────── */

export function readSheetBudget(tabs: SheetTabs): SheetImportPlan {
  const plan: SheetImportPlan = {
    title: null,
    shows: [],
    lines: [],
    commissions: [],
    overheads: { insurance: null, contingency: null, accountancy: null },
    rates: [],
    perDiems: [],
    flights: [],
    hotels: [],
    notes: [],
  };
  const summary = tab(tabs, 'SUMMARY');
  if (summary) {
    plan.title = clean(summary[2]?.[0]).split(/\n|\|/)[0].trim() || null;
    readSummary(summary, plan);
  } else plan.notes.push('No SUMMARY tab — no commissions, overheads or rates read.');

  const routing = tab(tabs, 'ROUTING & INCOME', 'ROUTING AND INCOME', 'ROUTING');
  if (routing) plan.shows = readShows(routing, plan.notes);
  else plan.notes.push('No ROUTING & INCOME tab — no show deals read.');

  const transport = tab(tabs, 'TRANSPORTATION', 'TRANSPORT');
  if (transport) plan.lines.push(...readBlocks(transport, 'Transport'));
  const prod = tab(tabs, 'PROD & MISC EXPENSES', 'PRODUCTION', 'PROD & MISC');
  if (prod) plan.lines.push(...readBlocks(prod, 'Production'));

  const flights = tab(tabs, 'FLIGHTS');
  if (flights) plan.flights = readFlights(flights);
  const hotels = tab(tabs, 'HOTELS');
  if (hotels) plan.hotels = readHotels(hotels);
  return plan;
}
