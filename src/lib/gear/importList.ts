/* ============================================
   LOWPASS — import stock from a list or a spreadsheet (Nov 2026)

   Adam has no stock sheet, so this takes whatever comes: a pasted list (one
   item per line, "8 x SM58" / "SM58 x8" for quantities) or a CSV / TSV
   export with a header row, its columns recognised by name. Pure — the
   route runs the same `cleanImportRow` on what the browser sends.
   ============================================ */

import { CATEGORIES } from '@/components/equipment/types';

export interface ImportRow {
  name: string;
  quantity: number;
  category: string | null;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  purchaseCost: number | null;
  dayRate: number | null;
  value: number | null;
  weightKg: number | null;
  notes: string | null;
}

export type ImportField = keyof ImportRow;

/** Header words → field. Compared lower-case, punctuation stripped. */
const ALIASES: Record<Exclude<ImportField, never>, string[]> = {
  name: ['name', 'item', 'items', 'description', 'product', 'equipment', 'gear', 'item name'],
  quantity: ['qty', 'quantity', 'count', 'owned', 'number', 'no', 'units', 'stock'],
  category: ['category', 'type', 'department', 'dept', 'group', 'section'],
  manufacturer: ['manufacturer', 'make', 'brand', 'mfr'],
  model: ['model', 'model number', 'part number', 'part no'],
  serial: ['serial', 'serial number', 'sn', 's n', 'serial no', 'asset tag'],
  purchaseCost: ['purchase cost', 'cost', 'purchase price', 'price paid', 'paid', 'bought for'],
  dayRate: ['day rate', 'rate', 'daily rate', 'hire rate', 'rental rate', 'per day'],
  value: ['value', 'replacement', 'replacement value', 'retail', 'retail price', 'insured value', 'rrp'],
  weightKg: ['weight', 'weight kg', 'kg', 'mass'],
  notes: ['notes', 'note', 'comments', 'comment'],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function fieldForHeader(h: string): ImportField | null {
  const n = norm(h);
  if (!n) return null;
  for (const [f, words] of Object.entries(ALIASES) as [ImportField, string[]][]) {
    if (words.includes(n)) return f;
  }
  return null;
}

/** One CSV / TSV line → cells (quotes and doubled quotes honoured). */
export function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === '') { q = true; cur = ''; }
    else if (ch === delim) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** "£1,250.00" → 1250; blank / junk → null. */
export function readMoney(v: string | null | undefined): number | null {
  if (v == null) return null;
  const t = String(v).replace(/[^0-9.\-]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** "2.5", "2.5 kg", "5.5 lb" → kg. */
export function readWeight(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = /([0-9]+(?:\.[0-9]+)?)\s*(kg|g|lb|lbs)?/i.exec(String(v));
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? 'kg').toLowerCase();
  const kg = unit === 'g' ? n / 1000 : unit.startsWith('lb') ? n * 0.45359237 : n;
  return kg > 0 && kg <= 5000 ? Math.round(kg * 100) / 100 : null;
}

/** "8 x SM58", "8x SM58", "SM58 x8", "SM58 (8)", "SM58, 8" → 8 + "SM58". */
export function readListLine(line: string): { name: string; quantity: number } | null {
  const t = line.replace(/^[\s\-*•·]+/, '').trim();
  if (!t) return null;
  let m = /^(\d{1,4})\s*[x×]?\s+(.+)$/i.exec(t) ?? /^(\d{1,4})\s*[x×](.+)$/i.exec(t);
  if (m) return { name: m[2].trim(), quantity: Number(m[1]) || 1 };
  m = /^(.+?)\s*(?:[x×]\s*(\d{1,4})|\((\d{1,4})\)|,\s*(\d{1,4}))$/i.exec(t);
  if (m) return { name: m[1].trim(), quantity: Number(m[2] ?? m[3] ?? m[4]) || 1 };
  return { name: t, quantity: 1 };
}

const text = (v: unknown, max = 200): string | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const t = String(v).replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

/** The app's category when it matches one, else what was typed. */
export function cleanCategory(v: unknown): string | null {
  const t = text(v, 60);
  if (!t) return null;
  return CATEGORIES.find((c) => c.toLowerCase() === t.toLowerCase()) ?? t;
}

/** THE row gate — the browser's preview and the server both use it. */
export function cleanImportRow(raw: Partial<Record<ImportField, unknown>>): ImportRow | null {
  const name = text(raw.name, 120);
  if (!name) return null;
  const q = Math.round(Number(raw.quantity));
  const num = (v: unknown) => (typeof v === 'number' ? (Number.isFinite(v) && v >= 0 ? v : null) : readMoney(v as string));
  return {
    name,
    quantity: Number.isFinite(q) && q >= 1 && q <= 100_000 ? q : 1,
    category: cleanCategory(raw.category),
    manufacturer: text(raw.manufacturer, 80),
    model: text(raw.model, 80),
    serial: text(raw.serial, 80),
    purchaseCost: num(raw.purchaseCost),
    dayRate: num(raw.dayRate),
    value: num(raw.value),
    weightKg: typeof raw.weightKg === 'number' ? (raw.weightKg > 0 && raw.weightKg <= 5000 ? raw.weightKg : null) : readWeight(raw.weightKg as string),
    notes: text(raw.notes, 1000),
  };
}

export interface ParsedImport {
  rows: ImportRow[];
  /** Which column each field came from ('list' = one item per line). */
  mode: 'table' | 'list';
  columns: Partial<Record<ImportField, string>>;
  /** Lines that couldn't be read (blank names, totals). */
  skipped: number;
}

/** A pasted list or a CSV / TSV text → rows. A header row is used when at
 *  least the name column is recognised; otherwise it's a list. */
export function parseImport(input: string): ParsedImport {
  const lines = input.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return { rows: [], mode: 'list', columns: {}, skipped: 0 };
  const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(',') ? ',' : lines[0].includes(';') ? ';' : null;

  if (delim) {
    const header = splitLine(lines[0], delim);
    const map = new Map<number, ImportField>();
    header.forEach((h, i) => {
      const f = fieldForHeader(h);
      if (f && ![...map.values()].includes(f)) map.set(i, f);
    });
    if ([...map.values()].includes('name')) {
      const columns: Partial<Record<ImportField, string>> = {};
      for (const [i, f] of map) columns[f] = header[i];
      let skipped = 0;
      const rows: ImportRow[] = [];
      for (const line of lines.slice(1)) {
        const cells = splitLine(line, delim);
        const raw: Partial<Record<ImportField, unknown>> = {};
        for (const [i, f] of map) raw[f] = cells[i] ?? '';
        if (/^(total|subtotal|grand total)\b/i.test(String(raw.name ?? ''))) { skipped++; continue; }
        const row = cleanImportRow(raw);
        if (row) rows.push(row);
        else skipped++;
      }
      return { rows, mode: 'table', columns, skipped };
    }
  }

  let skipped = 0;
  const rows: ImportRow[] = [];
  for (const line of lines) {
    const got = readListLine(line);
    const row = got ? cleanImportRow({ name: got.name, quantity: got.quantity }) : null;
    if (row) rows.push(row);
    else skipped++;
  }
  return { rows, mode: 'list', columns: { name: '(one per line)' }, skipped };
}

/** Rows whose name is already in stock (case-insensitive) — offered unticked. */
export function alreadyInStock(rows: ImportRow[], stockNames: string[]): Set<number> {
  const have = new Set(stockNames.map((n) => n.trim().toLowerCase()));
  const out = new Set<number>();
  rows.forEach((r, i) => { if (have.has(r.name.toLowerCase())) out.add(i); });
  return out;
}
