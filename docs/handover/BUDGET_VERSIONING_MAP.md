# BUDGET_VERSIONING_MAP — Stage A (map only; no schema, no code)

> Phase 1 of the versioning epic. Decisions in `BUDGET_VERSIONING_DESIGN.md` §6
> are LOCKED; this maps the current model → the proposed schema/state-machine
> and surfaces the remaining **schema sub-decisions** for Adam + Claude sign-off.
> **Status:** Stage A. Awaiting review before any Stage B code/schema.

---

## 1. Current model — what is "proposed" vs "actual"

**`budget_line_items`** (migration `017:68` + later: `section_id`, `source_entity_type`,
`source_entity_id`, `actual_cost_override`, `phase_tag`):
- **PROPOSED (→ versioned):** `proposed_cost`, plus the line's *structure* — `label`,
  `category`, `quantity`, `section_id`, `order_index`, `routing_id`, `currency`.
- **ACTUAL (→ one live layer):** `actual_cost` (+ `actual_cost_override`), `receipt_id`,
  and the transactions that sum into it (`budget_line_item_transactions`, `expense_receipts`).
- **Derived lines:** `source_entity_type ∈ {payroll, payroll_per_diem, hotel_booking, gear, flight}`
  + `source_entity_id` (stable FK to personnel_rates.id / hotels.id). Written by
  `reconcileDerivedLines.ts` (`computePayrollDesired`/`computeHotelDesired`); it sets
  `proposed_cost === actual_cost === total` today (`Desired.total`).

**`budget_sections`** (`200:`): `id, tour_id, workspace_id, name, sort_order` (+ `kind`
`normal|derived|formula` from `203`, + `source`). Structure → part of "proposed".

**`budget_income`** (`017:`, UNIQUE(routing_id)): per show.
- **PROPOSED income:** `pre_tax_guarantee, withholding_pct, pre_tax_overage, merch_income,
  vip_income` (the projections feeding the P&L).
- **ACTUAL income:** `actual_guarantee, actual_overage, actual_merch, actual_vip`
  (settlement-fed). One live layer per §6 Q2.

**Reconcile feed:** `reconcileDerivedBudgetLines(supabase, tourId, workspaceId)` runs at
`api/budget/line-items` GET (`:166`) — find-or-update derived `payroll`/`hotel_booking`
lines by `(source_entity_type, source_entity_id)`. **Today it writes the proposed.**

**The structural fact that drives the schema:** proposed + actual are **co-located on
the same row** today (`proposed_cost`/`actual_cost`; `pre_tax_*`/`actual_*`). Versioning
the proposed while keeping actuals one live layer **requires splitting them.**

---

## 2. Versioning schema — the crux sub-decision

### `budget_versions` (agreed shape, §2)
```
budget_versions(
  id uuid pk, tour_id fk, workspace_id fk,
  version_number int,                       -- 1,2,3… per tour
  status text check (draft|approved|superseded),
  parent_version_id uuid null fk self,      -- the version it amends
  created_by uuid, approved_by uuid null, approved_at timestamptz null,
  note text null, created_at, updated_at,
  unique(tour_id, version_number)
)
```
Plus a pointer to the **active/current** approved version per tour — recommend a
partial unique index `unique(tour_id) where status='approved'` is WRONG (multiple
historical approved→superseded). Instead: "Current" = the **single `approved`** row
(others are `superseded`); enforce ≤1 `approved` per tour via a partial unique index
`unique(tour_id) where status='approved'` IS right because approve flips the prior
approved → superseded. Keep that invariant in the approve/amend transaction.

### Option (a) vs (b) — RECOMMEND **(b): canonical line identity + per-version proposed snapshot**

| | (a) full snapshot per version | **(b) canonical line + version snapshot** ✅ |
|---|---|---|
| Lines | each version gets its own COPY of section/line rows | ONE canonical `budget_line_items` row = the stable identity (survives versions) |
| Actuals | moved OUT to a tour-level table keyed by a synthetic `line_key` | **stay on `budget_line_items.actual_cost`** (+ receipt_id, transactions) — unchanged |
| Proposed | the version's copied rows | a new **`budget_version_lines`** snapshot (membership + structure + proposed value) |
| Variance join | version copy → match by `line_key` → tour-level actual (fuzzy identity) | `budget_version_lines.proposed_cost` ⋈ `budget_line_items.actual_cost` **on `line_item_id`** (exact) |
| Blast radius | HIGH — every actuals reader (grid, receipts route, reconcile, summary, overview) re-pointed to a new table | LOW — all actuals/receipt/routing/reconcile machinery on `budget_line_items` is untouched |
| Immutability | physical (frozen rows) | by status-gate (superseded/approved proposed is read-only via the approver gate) + Phase 2 audit log |

**Recommended (b) schema:**
```
budget_version_lines(
  id, version_id fk, line_item_id fk budget_line_items,  -- the stable identity
  section_id fk, label, category, proposed_cost, quantity, order_index, currency,
  present boolean default true,            -- a line removed in this version
  unique(version_id, line_item_id)
)
budget_version_sections(                   -- per-version section structure/order
  id, version_id fk, section_id fk, name, sort_order,
  unique(version_id, section_id)
)
```
- **Stable identity = `budget_line_items.id`.** It carries actuals/receipts/routing/
  `source_entity_*` for ALL versions (one live layer). A draft snapshots its proposed
  structure+values into `budget_version_lines`. Adding a line in a draft = insert the
  canonical line (identity) + its `budget_version_lines` row. "Deleting" a line in v2 =
  `present=false` (or absent) in v2's snapshot; the canonical row + v1's snapshot persist
  (history kept).
- **Derived lines:** the natural stable key is already `source_entity_id` → the canonical
  line is find-or-created by `(source_entity_type, source_entity_id)` exactly as today;
  the per-version proposed snapshots it. No synthetic `line_key` needed (the (a) pain).
- **Variance (the design's goal):** `approved version_lines.proposed_cost` (baseline) vs
  `budget_line_items.actual_cost` (live), joined on `line_item_id`. Trivial + exact.
- `budget_line_items.proposed_cost` becomes a **legacy mirror** (the active draft's value)
  — migrate it into v1's `budget_version_lines` and either keep it synced to the active
  draft for back-compat or deprecate reads of it (Stage B decides; the grid switches its
  proposed read to the active version's snapshot).

> **DECISION D-CRUX (sign-off needed):** adopt **(b)**. It diverges from the doc's
> tentative (a) lean — justified because §3a (feeds→actuals) is now LOCKED, so actuals
> permanently live on the canonical line; (b) keeps that machinery untouched, gives the
> exact variance join, and uses `source_entity_id` as the natural derived-line identity.
> Immutability is enforced by the status gate (write-deny on approved/superseded proposed)
> + the Phase 2 append-only audit log, not physical row-freezing.

### Income (sub-decision D-INCOME)
`budget_income` has proposed (`pre_tax_*`) + actual (`actual_*`) co-located, like lines.
For a coherent **approved P&L baseline**, the proposed income should be version-scoped too:
mirror (b) with **`budget_version_income(version_id, routing_id, pre_tax_guarantee,
withholding_pct, pre_tax_overage, merch_income, vip_income)`**; actuals stay on
`budget_income.actual_*` (one live layer). **Recommend versioning income proposed in
Phase 1** (the P&L variance-vs-approved needs it). If descoped, Phase 1 variance is
**expenses-only** and income proposed stays one live layer — say so explicitly. **Flag for
Adam.**

---

## 3. Approver grant (§6 Q3 — grantable, gated; NO assign-UI this phase)

Mirror the `060_roles_wiring` pattern (per-workspace `roles`, `is_workspace_admin()` /
`get_my_workspace_id()` SECURITY-DEFINER helpers + RLS via them). Two ways to store the
grant:
- **(per-member grant table) ✅ recommend:** `budget_approver_grants(workspace_id,
  user_id, granted_by, granted_at, unique(workspace_id, user_id))` + helper
  `public.is_budget_approver()` = `is_workspace_admin() OR EXISTS(grant for auth.uid() in
  my workspace)`. Explicit, auditable (who/when), "add to any member" literally.
- (role permission) `roles.permissions->>'can_approve_budget'` — simpler but overloads the
  jsonb + is role-level not member-level.

> **DECISION D-APPROVER:** the grant **table** + `is_budget_approver()` helper; admins are
> implicitly approvers. **Do NOT build the assign UI** — note it as a follow-up surface on
> `/settings/team` (same deferral as the AI ticket). Gate `approve`/`unlock`/`re-approve`
> server-side on `is_budget_approver()` + RLS WITH CHECK.

---

## 4. State machine + endpoints

```
draft ──approve(lock)──▶ approved (="Current")
  ▲                         │
  │ unlock                  │ amend
  └──────────── editable ◀──┘   └─▶ clone latest approved → new draft v(n+1);
                                     prior approved → superseded
re-approve: approved-again (same version_number)
```
**Endpoints (all gated by `is_budget_approver()` except read):**
- `POST /api/budget/versions` — create the first draft (or scaffolds v1 on first load).
- `POST /api/budget/versions/[id]/approve` — set `approved` + `approved_by/at`; flip any
  prior `approved` for the tour → `superseded` (one txn; keeps the ≤1-approved invariant).
- `POST /api/budget/versions/[id]/unlock` — `approved → draft` (same number), editable again.
- `POST /api/budget/versions/[id]/amend` — clone latest approved's `version_lines` +
  `version_income` into a new `draft` v(n+1) (`parent_version_id` set); prior → `superseded`.
- `GET /api/budget/versions?tour_id=` — list for the selector (number, status, Current).
- Existing `PATCH/POST /api/budget/line-items` + `POST /api/budget/income` gain the **lock
  guard** (§5): a proposed write to an `approved` version → `423` `VERSION_LOCKED`.

---

## 5. Lock enforcement + the prompt + the pill

- **Server (the real gate):** `line-items` POST/PATCH and `income` POST resolve the
  target line's active version; if it's `approved` AND the write touches a **proposed**
  field → reject `{ error, code: 'VERSION_LOCKED', versionId }` (HTTP 423). Actual-only
  writes (actual_cost, receipts, settlement income actuals) always pass. This is also the
  **AI-suggestion intercept** (§6) — the AI "Add it" POSTs here, so it can't bypass the lock.
- **Client (cosmetic + UX):** extend the Grid derived-lock guard (`Grid.tsx:1460`,
  `sec.kind==='derived' && est|act`) to *also* treat a proposed cell as read-only when
  `versionLocked` (a new opt-in prop, like `fillHandle` etc.). On a locked-proposed edit
  attempt → the **Unlock-or-New-Version** modal: *"This budget is approved & locked —
  Unlock & re-approve, or Create a new version."* (Reuse the existing `GridModals`
  confirm/prompt primitives.)
- **"Current" pill:** in the version selector dropdown AND a persistent chip on every
  budget screen — render in `BudgetContextBand` (the sub-bar) next to the tour identity;
  token-clean (orange = current/approved, muted = draft, grey = superseded).
- **Version selector:** lives on the Budget nav — add to `BudgetContextBand`'s `rightSlot`
  or `leftSlot` (a `v2 · approved ▾` control) listing versions (view past read-only / amend
  / new). The Settings tab (Phase 0) is where approve/unlock actions + the note live.

---

## 6. AI-suggestion seam (now real on main)
The AI "Add it" is currently a **TODO** (`LineItemDetailPanel.tsx:892-899` — informational
only, no write yet). When wired it POSTs to **`/api/budget/line-items`** (per
`CC_AI_SUGGESTIONS_GATE.md` R.4). **Therefore the §5 server lock guard on that route covers
the AI seam automatically** — an AI nudge that targets an approved version gets the same
`423 VERSION_LOCKED` → the UI raises the same Unlock-or-New-Version prompt. **No separate
AI intercept needed**; the map's instruction is satisfied by putting the gate in the route,
not the component. (Note for B2: when the "Add it" button is built, it must surface the
`VERSION_LOCKED` response as the prompt, not a generic toast.)

---

## 7. Blast radius (every surface that must become version-aware)
| Surface | File | Needs |
|---|---|---|
| Budget page loader | `budget/[tourId]/page.tsx` | load active version + its `version_lines`/`version_income`; pass version + status down |
| Grid (Expenses) | `BudgetGridView.tsx` + `Grid.tsx` | proposed read from active version snapshot; `versionLocked` prop → read-only proposed + prompt; actuals stay editable |
| Classic spreadsheet | `BudgetSpreadsheetView.tsx` | same proposed-source + lock |
| Income grid | `BudgetIncomeGrid.tsx` | proposed from `version_income` (if D-INCOME=yes); actuals live |
| Summary / P&L | `BudgetSummaryTab.tsx`, `computeBudgetPnl.ts` | variance vs **approved** version (proposed) not the draft |
| Reconcile feeds | `reconcileDerivedLines.ts` + `line-items` GET | pre-lock → draft proposed (`version_lines`); **post-lock → `actual_cost`** only (§3a) — must read the active version's status |
| Receipts / transactions | `api/budget/receipts`, `…/transactions` | unchanged (actuals layer) — but confirm they never touch proposed |
| AI panel | `LineItemDetailPanel.tsx` → `line-items` route | covered by §5/§6 server gate |
| Context band | `BudgetContextBand.tsx` | version selector + Current pill |
| Export | `BudgetExportControls.tsx` | export the selected/approved version (note; low-risk) |

**Breaks if not version-aware:** the reconcile feed (would keep writing proposed onto a
locked version — the core §3 hazard); Summary variance (would compare draft-to-actual);
the grid (would edit the wrong version's proposed). These three are the must-haves for B1/B2.

---

## 8. Migration number
210 (`ai_suggestions_preferences`) is on **main**; 211 (`rag_document_chunks`) exists on a
feature branch (not main); 212/213 are free everywhere. **Use `212_budget_versioning.sql`**
(re-verify across active branches at write time per `database/migrations/README.md`).

---

## Decisions to sign off (then Stage B)
- **D-CRUX:** schema **(b)** — canonical `budget_line_items` identity (carries actuals) +
  `budget_version_lines`/`budget_version_sections` proposed snapshot. *(Recommended.)*
- **D-INCOME:** version income proposed in Phase 1 via `budget_version_income`
  *(recommended)*, or defer (expenses-only variance). **Adam to confirm.**
- **D-APPROVER:** per-member `budget_approver_grants` + `is_budget_approver()` helper;
  admins implicit; assign-UI deferred to `/settings/team`. *(Recommended.)*
- **Migration 212.**

⛔ **No schema, no code written.** Stopping for review.
