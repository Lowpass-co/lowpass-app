# Smoke — Tour Accounting Workbook (X1)

The six-sheet `.xlsx` export (X1-A) + review-queued import (X1-B). Export is
read-only over the loaders; settlement money is the harness-proven `computeWalk`
(never recomputed). ExcelJS writer (`src/lib/export/workbook.ts`), route
`POST /api/export/workbook`.

Format: see [README.md](README.md).

---

#### XLS-01 — Export builds a real workbook (parse-and-assert) ✅ **automated**
**Run**: `npx tsx src/lib/export/workbook.test.ts`
**Asserts** (against the Atlanta worked example): the **Settlements** sheet
Outstanding cell = **£6,500** (straight from `computeWalk`); the **Budget** section
subtotal is a **real `=SUM(D2:D3)` range formula** (not a baked value); Variance is a
live `=Actual-Estimate` formula; the Provenance column shows **Auto** for derived
lines and **Manual** for hand-entered. Output: `workbook export: 9 checks passed`.

**Live**: on Budget, click **Export workbook…** (`[data-testid="budget-export-workbook"]`).
A six-sheet workbook downloads — Overview · Budget · Income · Settlements · Payroll ·
Per Diems. Money cells carry a currency number format with **negatives in red**
(format, not a hardcoded colour); every sheet has a frozen header row; section
subtotals + grand totals are live `=SUM()` ranges an accountant can edit. If payroll
is finalized, the Payroll total row says "TOTAL (finalized)".

> Net-new vs the old per-surface `/api/export/xlsx`: real formulas + negative-red
> formats + the Income/Per-Diem sheets. Distinct route, distinct builder.

#### XLS-02..05 — Import (review-queued) ✅ **automated core**
**Run**: `npx tsx src/lib/import/import.test.ts` → `workbook import: 23 checks passed`.
Covers the parse + dedupe engine that drives every smoke:
- **XLS-02** — export → edit a cell → re-parse: exactly **one** `value_change` (the
  edited row); the unchanged rows are exact duplicates.
- **XLS-03** — a duplicate row is flagged (**Possible duplicate**) and **default-skips**
  (`defaultAccept: false`); genuinely new lines default-accept.
- **XLS-04** — a foreign layout returns `layout: 'foreign'` + a column-mapping preview
  (Description→name, Cost→amount guessed); confirming the map yields proposals.
- **XLS-05** — accepting nothing writes zero rows.
- Settlement/Payroll sheets are **rejected** on import with a read-only message.
- Round-trip: X1-A export re-parses as our layout (subtotal/grand-total rows skipped).

**Live**: on Budget, **Import workbook…** (`[data-testid="budget-import-workbook"]`)
→ upload → review list (New / Possible duplicate / Changed; dups off by default) →
**Import N accepted**. Accepted rows write through the **existing** `POST
/api/budget/line-items` path (internal call, forwarded session — no parallel insert),
via the `import_pending_lines` proposal table (migration 244). Nothing writes until
you accept — Adam's drafts-you-approve rule.
