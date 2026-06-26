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
  /** Read-only cell (no edit on Enter / type / double-click). Default editable
      — existing columns omit it, so behaviour is unchanged. Used by Income's
      routing-derived Show column. */
  ro?: boolean;
  options?: string[];
  optColors?: Record<string, string>;
  /** Display labels for dropdown option values (value → label). The stored
      value is unchanged; only the cell text is prettied. Additive — budget uses
      `status`, not `dropdown`, so it's unaffected. */
  optLabels?: Record<string, string>;
  /** number-formula column: result = row[a] (op) row[b]. Serialisable. */
  formula?: { a: string; op: FormulaOp; b: string };
  /** computed column. NOT serialised into undo snapshots — re-hydrated by
      id from the initial column defs (see gridModel.cloneCols). */
  calc?: (row: Row) => number;
  /** user-added column (deletable). */
  custom?: boolean;
}

export interface Txn {
  /** real-row id (budget_line_item_transactions.id) when backed by a route. */
  id?: string;
  date: string;
  desc: string;
  amount: number;
  /** demo: a row.docs id. real: the linked expense_receipts id (or null). */
  receipt: string | null;
  /** real receipts live in expense_receipts (not row.docs) — their display
   *  label (receipt_number / vendor) rides along so the slide can show it. */
  receiptLabel?: string;
}

export interface Doc {
  /** stable id so a transaction can reference a document and reflect renames. */
  id?: string;
  type: string;
  name: string;
  /** real attachments carry their file URL for opening. */
  url?: string;
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
  /** Phase 3 Step 5 — server-supplied counts for the 📎 receipts cell, so the
   *  badge shows a real total before the slide lazily loads the full rows. */
  txnCount?: number;
  docCount?: number;
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

/** Phase 3 (Steps 3–5) — async CRUD for a line's transactions + documents,
 *  injected by real surfaces (budget). When ABSENT the slide keeps its
 *  in-memory demo behaviour (/grid-demo). `lineId` = the row's _uid (DB id).
 *  Methods return the grid's Txn/Doc shapes; the surface owns the field
 *  mapping to its tables. Receipts: a transaction's receipt is an
 *  expense_receipts row (receipt_id), distinct from the line's documents
 *  (budget_line_item_attachments) — see CC_GRID_PHASE3_SLIDE_MAP.md. */
export interface GridLineApi {
  listTransactions: (lineId: string) => Promise<Txn[]>;
  addTransaction: (lineId: string) => Promise<Txn>;
  patchTransaction: (
    txnId: string,
    patch: { desc?: string; date?: string; amount?: number },
  ) => Promise<void>;
  deleteTransaction: (txnId: string) => Promise<void>;
  /** create/link an expense_receipts row + set the txn's receipt_id. */
  attachReceipt: (lineId: string, txnId: string) => Promise<{ receiptId: string; label: string }>;
  /** Receipts overhaul B1 — open the real desktop Add-Receipt panel (drop →
   *  upload → scan → confirm) instead of minting a blank numbered pill. Resolves
   *  with the saved receipt, or null on cancel. `txnId` present → back that
   *  transaction; absent → line-level (the panel adds a transaction for the
   *  amount). When provided, the slide-over prefers this over `attachReceipt`. */
  onAddReceipt?: (ctx: { lineId: string; txnId?: string }) => Promise<{ receiptId: string; label: string; amount: number } | null>;
  /** Receipts overhaul B1 — a short-lived SIGNED URL for a receipt's stored file
   *  (the bucket is private), for the chip thumbnail + lightbox. null = no file. */
  signReceiptUrl?: (receiptId: string) => Promise<string | null>;
  listDocuments: (lineId: string) => Promise<Doc[]>;
  addDocument: (lineId: string, file: File) => Promise<Doc>;
  renameDocument: (lineId: string, docId: string, name: string) => Promise<void>;
  deleteDocument: (lineId: string, docId: string) => Promise<void>;
}

/** One undo/redo snapshot. `cols` is serialisable (calc fns stripped). */
export interface Snapshot {
  data: Section[];
  cols: Column[];
  widths: Record<string, number>;
}
