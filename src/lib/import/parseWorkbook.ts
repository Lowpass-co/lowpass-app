/* ============================================
   LOWPASS — Workbook import parse (X1-B)

   Turns uploaded sheet rows into PROPOSALS (never direct writes). Two paths:

     • OUR layout — a "Budget" sheet with Section/Item/Estimate/Actual columns
       (what X1-A exports) → budget_line proposals, straight through.
     • Foreign layout — no recognizable Budget sheet → a best-effort column-mapping
       PREVIEW (name/amount/date heuristics) the user confirms before anything is
       staged.

   Settlement & Payroll sheets are READ-ONLY on import — importing money-engine
   outputs backwards is how dual systems are born; they're rejected with a message.

   Pure over already-parsed rows (the route does the SheetJS read), so the smoke
   runs with zero DB.
   ============================================ */

export type SheetRows = Record<string, Array<Record<string, unknown>>>;

export interface ParsedProposal {
  target: 'budget_line';
  /** Matches the POST /api/budget/line-items body shape (minus tour_id, added on apply). */
  value: { section: string; label: string; vendor: string | null; proposed_cost: number; actual_cost: number; currency: string };
  source_ref: string;
}

export interface ColumnGuess {
  role: 'name' | 'amount' | 'date' | 'section' | 'ignore';
  column: string;
}
export interface MappingPreview {
  sheet: string;
  headers: string[];
  guesses: ColumnGuess[];
  sampleRows: Array<Record<string, unknown>>;
}

export interface WorkbookParse {
  layout: 'ours' | 'foreign' | 'empty';
  proposals: ParsedProposal[];
  mapping: MappingPreview | null;
  /** Human messages for skipped/rejected sheets (settlement/payroll read-only)
   *  and, when rows were skipped, one line naming them. */
  rejected: string[];
  /** Rows not offered (blank, totals, percentages). Our layout only. */
  skipped?: SkippedRow[];
}

const READ_ONLY_SHEETS = new Set(['settlements', 'settlement', 'payroll', 'per diems', 'perdiems']);
const num = (v: unknown): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v.replace(/[^0-9.\-]/g, '')) || 0;
  return 0;
};
const str = (v: unknown): string => (v == null ? '' : String(v).trim());

/** Case/space-insensitive header lookup. */
function pick(row: Record<string, unknown>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find((key) => key.toLowerCase().trim() === n.toLowerCase());
    if (k != null) return row[k];
  }
  return undefined;
}

export type SkipReason = 'blank' | 'total';

/** Why a sheet row must NOT become a budget line, or null when it may.
 *  - total: a roll-up the budget works out itself — subtotals, "Total …",
 *           "… total", net / gross income, profit & loss, balance. Checked
 *           on the section too: our export writes subtotal rows with the
 *           text in the Section column and no item.
 *  - blank: no letter or digit in the item ("", "—", "-").
 *  Rows that MIGHT be wrong but might be real (a percentage, no amount) are
 *  not dropped here — see reviewHint, which offers them unticked. */
export function skipRowReason(label: string, section = ''): SkipReason | null {
  const l = norm(label);
  if (isTotalText(l) || isTotalText(norm(section))) return 'total';
  if (!/[\p{L}\p{N}]/u.test(l)) return 'blank';
  return null;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function isTotalText(s: string): boolean {
  if (!s) return false;
  if (/sub-? ?totals?\b|grand totals?\b/.test(s)) return true;
  if (/^totals?\b|\btotals?$/.test(s)) return true;
  if (/^(net|gross) (income|profit|loss|revenue)\b/.test(s)) return true;
  if (/^(profit|p) ?(&|and|\/) ?(loss|l)\b/.test(s)) return true;
  if (/^(balance|surplus|deficit)$/.test(s)) return true;
  return false;
}

export interface SkippedRow {
  source_ref: string;
  label: string;
  reason: SkipReason;
}

/** One line for the review screen, so a skipped row is never silent. */
export function skippedNote(skipped: SkippedRow[]): string | null {
  if (skipped.length === 0) return null;
  const totals = skipped.filter((s) => s.reason === 'total');
  const blank = skipped.length - totals.length;
  const parts: string[] = [];
  if (totals.length) {
    const names = totals.slice(0, 4).map((s) => `“${s.label}”`).join(', ');
    const more = totals.length > 4 ? ` and ${totals.length - 4} more` : '';
    parts.push(`Skipped ${totals.length} total ${totals.length === 1 ? 'row' : 'rows'} — the budget adds these up itself (${names}${more}).`);
  }
  if (blank) parts.push(`Skipped ${blank} blank ${blank === 1 ? 'row' : 'rows'}.`);
  return parts.join(' ');
}

/** Rows that are offered but UNTICKED, with the reason shown under them:
 *  - worked out from a percentage ("INSURANCE (3%)", "Commission 15%") —
 *    overheads and commissions are typed as a % on the budget sheet, so
 *    importing the sheet's figure would count it twice and freeze it;
 *  - no estimate and no actual — usually a heading ("SALARY CREW").
 *  Not dropped: "Bus deposit 50%" with a real amount is a real line. */
export function reviewHint(v: { label: string; proposed_cost: number; actual_cost: number }): string | null {
  if (/\d\s*%/.test(v.label)) return 'Looks worked out from a percentage — set percentages on the budget sheet instead. Unticked.';
  if (!v.proposed_cost && !v.actual_cost) return 'No amount — looks like a heading. Unticked.';
  return null;
}

export function parseWorkbook(sheets: SheetRows, defaultCurrency = 'GBP'): WorkbookParse {
  const rejected: string[] = [];
  const names = Object.keys(sheets);
  for (const n of names) {
    if (READ_ONLY_SHEETS.has(n.toLowerCase().trim())) {
      rejected.push(`"${n}" sheet is read-only on import — settlement & payroll values are managed in the app.`);
    }
  }

  // OUR layout: a Budget sheet with the X1-A columns.
  const budgetName = names.find((n) => n.toLowerCase().trim() === 'budget');
  if (budgetName) {
    const rows = sheets[budgetName] ?? [];
    const proposals: ParsedProposal[] = [];
    const skipped: SkippedRow[] = [];
    rows.forEach((row, i) => {
      const section = str(pick(row, 'Section'));
      const label = str(pick(row, 'Item', 'Name', 'Description'));
      const reason = skipRowReason(label, section);
      if (reason) {
        skipped.push({ source_ref: `${budgetName}!row ${i + 2}`, label: label || section, reason });
        return;
      }
      proposals.push({
        target: 'budget_line',
        value: {
          section: section || 'Uncategorised',
          label,
          vendor: str(pick(row, 'Vendor')) || null,
          proposed_cost: num(pick(row, 'Estimate', 'Estimated', 'Budget')),
          actual_cost: num(pick(row, 'Actual', 'Actuals')),
          currency: (str(pick(row, 'Currency', 'Ccy')) || defaultCurrency).toUpperCase(),
        },
        source_ref: `${budgetName}!row ${i + 2}`,
      });
    });
    const note = skippedNote(skipped);
    return { layout: 'ours', proposals, mapping: null, rejected: note ? [...rejected, note] : rejected, skipped };
  }

  // Foreign layout: build a mapping preview from the first sheet that isn't read-only.
  const dataSheet = names.find((n) => !READ_ONLY_SHEETS.has(n.toLowerCase().trim()) && (sheets[n]?.length ?? 0) > 0);
  if (!dataSheet) return { layout: 'empty', proposals: [], mapping: null, rejected };

  const rows = sheets[dataSheet] ?? [];
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const guesses: ColumnGuess[] = headers.map((h) => ({ role: guessRole(h, rows, h), column: h }));
  return {
    layout: 'foreign',
    proposals: [],
    mapping: { sheet: dataSheet, headers, guesses, sampleRows: rows.slice(0, 3) },
    rejected,
  };
}

function guessRole(header: string, rows: Array<Record<string, unknown>>, col: string): ColumnGuess['role'] {
  const h = header.toLowerCase();
  if (/(item|name|descr|line|detail)/.test(h)) return 'name';
  if (/(amount|cost|total|estimate|actual|price|fee|budget|£|\$|€)/.test(h)) return 'amount';
  if (/(date|day|when)/.test(h)) return 'date';
  if (/(section|category|group|type)/.test(h)) return 'section';
  // value-based fallback: mostly-numeric column → amount.
  const vals = rows.slice(0, 10).map((r) => r[col]);
  const numeric = vals.filter((v) => typeof v === 'number' || (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)))).length;
  if (vals.length > 0 && numeric / vals.length >= 0.6) return 'amount';
  return 'ignore';
}

/** Apply a confirmed foreign-column mapping → budget_line proposals. */
export function applyMapping(
  sheet: string,
  rows: Array<Record<string, unknown>>,
  map: { name?: string; amount?: string; date?: string; section?: string },
  defaultCurrency = 'GBP',
): ParsedProposal[] {
  return mapRows(sheet, rows, map, defaultCurrency).proposals;
}

/** applyMapping, plus the rows it skipped (blank, totals, percentages). */
export function mapRows(
  sheet: string,
  rows: Array<Record<string, unknown>>,
  map: { name?: string; amount?: string; date?: string; section?: string },
  defaultCurrency = 'GBP',
): { proposals: ParsedProposal[]; skipped: SkippedRow[] } {
  const out: ParsedProposal[] = [];
  const skipped: SkippedRow[] = [];
  rows.forEach((row, i) => {
    const label = map.name ? str(row[map.name]) : '';
    const section = map.section ? str(row[map.section]) : '';
    const reason = skipRowReason(label, section);
    if (reason) {
      skipped.push({ source_ref: `${sheet}!row ${i + 2}`, label: label || section, reason });
      return;
    }
    const amount = map.amount ? num(row[map.amount]) : 0;
    out.push({
      target: 'budget_line',
      value: {
        section: (map.section ? str(row[map.section]) : '') || 'Imported',
        label,
        vendor: null,
        proposed_cost: amount,
        actual_cost: 0,
        currency: defaultCurrency.toUpperCase(),
      },
      source_ref: `${sheet}!row ${i + 2}`,
    });
  });
  return { proposals: out, skipped };
}
