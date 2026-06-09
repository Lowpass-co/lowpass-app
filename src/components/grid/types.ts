/* ============================================
   LOWPASS — Canonical Grid · types

   Ported from docs/prototypes/grid-playbox.html + GRID_SPEC.md §4.
   The data model is the same shape the playbox proved end-to-end; these
   are the TS types for it. Pure (no React) so server + client can import.
   ============================================ */

export type ColType =
  | 'idx'
  | 'text'
  | 'money'
  | 'number'
  | 'check'
  | 'dropdown'
  | 'status'
  | 'variance'
  | 'formula'
  | 'calc'
  | 'receipts'
  | 'doc'
  | 'deal';

export type FormulaOp = '+' | '-' | '*';

export interface Column {
  id: string;
  label: string;
  type: ColType;
  /** current width in px (the live width lives in the `widths` map, keyed
      by id; `w` is the default restored by "Reset widths"). */
  w: number;
  min: number;
  resize: boolean;
  hidden?: boolean;
  options?: string[];
  optColors?: Record<string, string>;
  /** number-formula column: result = row[a] (op) row[b]. Serialisable. */
  formula?: { a: string; op: FormulaOp; b: string };
  /** computed column. NOT serialised into undo snapshots — re-hydrated by
      id from the initial column defs (see gridModel.cloneCols). */
  calc?: (row: Row) => number;
  /** user-added column (deletable). */
  custom?: boolean;
}

export interface Txn {
  date: string;
  desc: string;
  amount: number;
  receipt: string | null;
}

export interface Doc {
  /** stable id so a transaction can reference a document and reflect renames. */
  id?: string;
  type: string;
  name: string;
}

export interface Link {
  type: string;
  name: string;
}

export interface Row {
  _uid?: string;
  item?: string;
  icon?: string;
  vendor?: string;
  est?: number;
  act?: number;
  status?: string;
  cur?: string;
  notes?: string;
  /** formula-section line extras. */
  pct?: number;
  basis?: 'gross' | 'net';
  custom?: boolean;
  /** relational / detail extras (slide-over is a later phase). */
  transactions?: Txn[];
  docs?: Doc[];
  links?: Link[];
  memos?: string[];
  /** custom-column values, the day-type dropdown, deal split, etc. */
  [key: string]: unknown;
}

export type SectionKind = 'normal' | 'derived' | 'formula';

export interface Section {
  name: string;
  kind: SectionKind;
  /** derived sections name their owning module (Payroll / Rooming / …). */
  source?: string;
  rows: Row[];
  /** stable accent — belongs to the section, not its position. */
  accent?: string;
  _uid?: string;
  /** transient: section index, stamped during render. */
  _si?: number;
}

/** Active cell (a*) + focus cell (f*); a≠f means a range is selected. */
export interface Sel {
  ar: number;
  ac: number;
  fr: number;
  fc: number;
}

export type Density = 'compact' | 'comfortable' | 'spacious';
export type GroupBy = 'section' | 'status';

/** Injected currency/FX so the grid isn't bound to the demo's static table.
 *  The demo passes `demoFx` (gridModel); the budget passes one built from
 *  src/lib/budget/fx.ts + the tour currency. */
export interface GridFx {
  /** the grid's display currency (tour currency for budget). */
  displayCurrency: string;
  /** currencies offered in the slide's currency menu. */
  currencies: string[];
  /** convert an amount in `fromCur` into the display currency. */
  toDisplay: (amount: number, fromCur: string) => number;
  /** symbol for a currency code, e.g. '$' / '£'. */
  symbol: (cur: string) => string;
  /** format a display-currency amount, e.g. "$1,234". */
  formatDisplay: (amount: number) => string;
}

/** Status set + colours for a surface (the slide menu + column reuse this). */
export interface GridStatusConfig {
  options: string[];
  colors?: Record<string, string>;
}

/** One undo/redo snapshot. `cols` is serialisable (calc fns stripped). */
export interface Snapshot {
  data: Section[];
  cols: Column[];
  widths: Record<string, number>;
}
