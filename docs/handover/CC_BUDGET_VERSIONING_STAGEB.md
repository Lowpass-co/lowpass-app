# CC — Budget Versioning Stage B: GO (decisions signed off). B1 only, then stop.

`BUDGET_VERSIONING_MAP.md` reviewed + pressure-tested. **Commit the map.** Build **B1
(data + state + endpoints + guards) ONLY** on a fresh branch off `main`. B2 (UI) is a
separate prompt after I verify B1.

## Decisions — LOCKED
- **D-CRUX = (b)** — canonical `budget_line_items` carries actuals/receipts/routing/
  `source_entity_*` (one live layer, untouched); `budget_version_lines` +
  `budget_version_sections` snapshot the proposed per version. Variance joins
  `version_lines.proposed_cost ⋈ budget_line_items.actual_cost` on `line_item_id` (exact).
- **D-CRUX hardening (REQUIRED, not optional): DB-level immutability.** The lock is NOT
  route-only. Add an RLS `WITH CHECK` policy (or a `BEFORE UPDATE/INSERT/DELETE` trigger)
  on `budget_version_lines`, `budget_version_sections`, `budget_version_income` that
  **denies any write when the parent `budget_versions.status <> 'draft'`**. A locked
  version must be uncorruptable even by a buggy server path. The route guard (§5) is the
  UX layer; this is the integrity layer. Build both.
- **D-INCOME = version income NOW.** Mirror (b): `budget_version_income(version_id,
  routing_id, pre_tax_guarantee, withholding_pct, pre_tax_overage, merch_income,
  vip_income)`. Actuals stay on `budget_income.actual_*` (live). The approved P&L baseline
  = version_income (proposed) vs budget_income (actual). **Header-comment this table** with:
  "versions the CURRENT income columns; when the income redesign (Settlement→actuals,
  formula merch/VIP, per-row currency) lands, this table migrates alongside `budget_income`."
- **D-APPROVER = grant table + admins implicit.** `budget_approver_grants(workspace_id,
  user_id, granted_by, granted_at, unique(workspace_id, user_id))` + SECURITY-DEFINER
  helper `public.is_budget_approver()` = `is_workspace_admin() OR EXISTS(grant for
  auth.uid() in get_my_workspace_id())`. Mirror `060_roles_wiring`. **No assign-UI** —
  defer to `/settings/team` (note it). Gate approve/unlock/amend server-side + RLS.
- **Migration `212_budget_versioning.sql`** (re-verify next-free across active branches at
  write time; 210 on main, 211 = RAG on a branch).

## Two B1 fixes I'm pulling forward (do NOT defer to Stage B)
1. **Kill the `proposed_cost` drift footgun.** Don't leave two readable sources of the
   proposed value. Migrate existing `budget_line_items.proposed_cost` into **v1's**
   `budget_version_lines`, and make the **snapshot the single canonical source** of
   proposed. Keep the column write-through for ONE release as a fallback (or stop reading
   it now) — but the grid/summary/reconcile read proposed from the active version's
   snapshot, never the column. State which you chose in the PR description.
2. **Reconcile post-lock = highest-risk; test it explicitly.** `reconcileDerivedLines`
   must read the active version's **status**: pre-lock → write the derived line's proposed
   into the active draft's `version_lines`; **post-lock → update `actual_cost` ONLY**, never
   the locked proposed. Required test: lock a version → change a `personnel_rates` rate →
   assert (a) the locked proposed snapshot is UNCHANGED and (b) `budget_line_items.actual_cost`
   moved.

## B1 scope
- **Migration 212:** `budget_versions` (+ partial unique index `unique(tour_id) where
  status='approved'` — this is **load-bearing for concurrency**: two simultaneous approves →
  one fails on the index; do NOT drop it), `budget_version_lines`, `budget_version_sections`,
  `budget_version_income`, `budget_approver_grants`, `is_budget_approver()`, the DB-level
  immutability policy/trigger above, RLS on all new tables via
  `get_my_workspace_id()`/`is_budget_approver()`. Idempotent (IF NOT EXISTS / CREATE OR
  REPLACE / ON CONFLICT), down-migration block, applied via `npm run db:migrate`. Backfill:
  scaffold **v1 (draft)** per existing tour from current `budget_line_items`/`budget_income`.
- **Endpoints** (all approver-gated except read): `POST /api/budget/versions` (scaffold v1
  if absent), `…/[id]/approve` (set approved + flip prior approved→superseded, one txn),
  `…/[id]/unlock` (approved→draft, same number), `…/[id]/amend` (clone latest approved's
  version_lines+version_income → new draft v(n+1), parent set, prior→superseded),
  `GET /api/budget/versions?tour_id=`.
- **Lock guard** on existing `POST/PATCH /api/budget/line-items` + `POST /api/budget/income`:
  resolve target's active version; if `approved` AND the write touches a **proposed** field
  → reject `{code:'VERSION_LOCKED', versionId}` HTTP **423**. Actual-only writes pass. A
  **mixed** proposed+actual write on a locked version → reject **wholesale** (no partial
  apply). This same guard is the AI "Add it" intercept — no separate code.

## B1 verify floor (must pass before you push)
- approve flips prior approved→superseded **atomically**; the partial unique index rejects a
  concurrent second approve.
- locked-version **proposed** write → 423; **actual** write → 200; mixed → 423.
- **DB-level:** a direct `UPDATE budget_version_lines` against a non-draft version is denied
  by the policy/trigger (not just the route).
- reconcile post-lock writes actual, not proposed (the test above).
- amend clones latest approved's lines+income into a new draft; prior → superseded.
- `next build --webpack`; tsc 0; eslint 0. Tokens (no new UI yet, but any constant clean).

## Hard rules
- Don't regress: the Grid (formula/fill/menus/live totals), reconcile feeds, receipts/
  transactions (actuals layer — confirm they never touch proposed), income P&L parity, the
  AI gate. RLS via the helpers — never inline workspace SQL.
- **Verify before claiming** — name files/lines; push B1 with its hash + "Pushed `<hash>`"
  and the v1-backfill + proposed_cost-handling decisions stated. **Then STOP** — I
  Chrome+code-verify B1 before you build B2 (version selector, Current pill, read-only-when-
  locked proposed, the Unlock-or-New-Version prompt, income grid → version_income read).
