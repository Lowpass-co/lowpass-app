# CC — X1: TOUR ACCOUNTING WORKBOOK (XLSX export + review-queued import). SINGLE OWNER, BANK-PER-STAGE, PUSH EVERY BANK.

Competitive context: `docs/design/COMPETITIVE_GAMEPLAN_ATOM_2026-07-19.md` §11 and Part 3 §X1. The strategic point: tour accountants and business managers live in Excel and will not stop. A PDF is terminal; a workbook is a conversation — export it, the BM edits it, it comes back in with duplicate flagging. ATOM ships this; we ship 8 PDF types and zero XLSX. This stage flips the documents arena.

Adam's ruling driving scope: "our excel approach is better" — the workbook must read like OUR budget grid (sections, mono numerics, provenance), not a generic dump.

**Topology first:** map the export shell (`src/lib/export/`), the M1 settlement walk loader (`loadSettlementWalk`/`computeWalk` — harness-proven, REUSE, never recompute), the budget line loaders, payroll statement builders, and the intake review-queue grammar (`intake_pending_answers` accept/reject pattern). Report file:line before code. Library: use a maintained XLSX writer (e.g. exceljs) — check what's already in package.json before adding anything.

## Stage X1-A — Export
`POST /api/export/workbook` + an "Export workbook…" entry in the Budget Export menu. Options (match the existing export-config grammar): scope (whole tour), currency display (tour ccy), sheet toggles. Sheets:
1. **Overview** — tour name/artist/dates/currency, net P&L summary, generated-at, app branding. Frozen header rows on every sheet.
2. **Budget** — sections as grouped rows (Salaries, Per Diems, …), columns: item · vendor · estimate · actual · variance · status · provenance (Auto/Manual — the M1-A chip data, as a column). Formulas for section subtotals and grand total (real `=SUM()` ranges, not baked numbers — accountants will edit rows).
3. **Income** — per-show income lines with FX rate + locked flag + provenance.
4. **Settlements** — one row per show: date · venue · city · guarantee · deductions Σ · adjusted gross · expenses Σ · show net · artist total · payments Σ · outstanding · Full&Final. Values from `computeWalk` — the harness-proven path.
5. **Payroll** — per person: role · rate type · rate · days S/O/R · fees · per diem · total (rates SSOT read path). If payroll is finalized, say so in the sheet header.
6. **Per Diems** — per person-day rollup.
All money cells: number format with currency symbol, negatives red (format, not hardcoded color). Mono-look via a consistent number format; do NOT try to embed app fonts.
Smoke XLS-01: export, open with a parser, assert section subtotal formula ranges and settlement outstanding for the Atlanta worked example (£6,500) match the app.

## Stage X1-B — Import (review-queued, never direct-write)
`POST /api/import/workbook` accepting an edited workbook (ours re-uploaded, or a foreign one):
1. Parse tolerantly: match our sheet/column names first; unknown layout → best-effort column mapping preview (name/amount/date heuristics), user confirms the mapping before anything is staged.
2. **Everything lands as PROPOSALS in the review-queue grammar** (the intake pattern): each row → proposed budget line / expense / income actual with source cell reference. NOTHING writes directly — Adam's AI-trust rule: drafts, you approve.
3. **Duplicate flagging:** propose-match against existing lines on (section + fuzzy name ≥0.85 + amount within 1% + date). Matches render as "Possible duplicate of X — skip / import anyway / replace value". Default = skip.
4. Accept/reject per row + accept-all-non-duplicates. Accepted rows write through the SAME single write paths the UI uses (no parallel insert path — the anti-pattern rule).
5. Settlement/payroll sheets are READ-ONLY on import in v1 — reject with a clear message ("settlement values are managed in the app"); importing money-engine outputs backwards is how dual systems are born.
Smokes XLS-02 export→edit-a-cell→reimport proposes exactly one change · XLS-03 duplicate row flags and default-skips · XLS-04 foreign-layout CSV/XLSX reaches mapping preview · XLS-05 reject leaves zero rows.

## Gates
Floor green · money harnesses untouched and re-run green (export is read-only; import writes only via existing paths) · no new tables expected — if the proposals need one (likely: `import_batches` + reuse pending-answer shape), it's ONE migration, next free number verified, idempotent, paste-SQL + wait. Screenshots of the mapping preview + duplicate UI. Raw git evidence. Cowork verifies with one export-parse + one import round-trip.
