# CC — P0: role is not enforced on ~165 of ~190 mutating endpoints. BEFORE ANY BETA INVITE.

Found 2026-07-23. Adam created a second workspace member with role **readonly**, clicked "New artist" in the UI, and **the artist was created and persisted.** A full audit followed. The button was the symptom; the model is the finding.

## What is actually true

**Authorization is delegated to Postgres RLS, and RLS only encodes role on 9 tables.**

Route code across the app does: `auth.getUser()` → read `profiles.workspace_id` → write with the user-scoped client. That is authentication + tenancy, **not authorization**. The role check was intended to live in RLS. Migration `079_permissions_rls_helpers.sql:24-42` states this explicitly and lists the 9 "strict-gated" tables (`budget_line_items`, `expense_receipts`, `expenses`, `personnel_rates`, `payroll_entries`, `deal_memos`, `budget_commissions`, `budget_income`, `settlement`) and then names the rest as **"membership-trusted"** — meaning any authenticated member, including `readonly`, may INSERT/UPDATE/DELETE.

`POST /api/artists` (`src/app/api/artists/route.ts:41-56`) has no role check, and the policy behind it (`004_fix_rls_recursion.sql:51`) is `WITH CHECK (workspace_id = get_my_workspace_id())`. Nothing in either layer looks at role. Same for PATCH/DELETE.

**The gap is growing.** Everything added after 079 was created with plain workspace-scoped `FOR ALL` policies and never retro-fitted: transactions (mig 104), budget versions (212), FX rates (216), settlement itemization (243), rate types, budget sections, budget templates, line-item notes/attachments.

**Helper adoption is ~8%** — 197 route files hand-roll the auth block inline. The most-used shared helper, `requireUserAndWorkspace()` (`src/lib/auth/workspace-check.ts:34`), is by its own docstring the "authenticated workspace member" gate and deliberately does not check role. The real permission helper (`canAccess` in `src/lib/permissions/server.ts`) is used by 11 route files.

## Severity, honestly
- **Not currently exploited.** One workspace, one real user, no external members. Nothing is leaking today.
- **Blocks beta absolutely.** The moment a second person has an account, "readonly" means nothing across most of the app.
- **Cross-tenant on one route** (P0-A below), which is worse than the role gap.

## P0-A — cross-workspace write. Fix first, it's small.
`PATCH /api/venues/canonical/[id]` (`src/app/api/venues/canonical/[id]/route.ts:72-77`) authenticates, does **no role check**, and then writes with a **service-role client** (RLS bypassed) to `canonical_venues` — which is a **shared cross-workspace directory**. Any authenticated user of *any* workspace can rewrite any global venue record by id.

Fix: role-gate it (admin/manager or a venue grant), and re-examine whether it needs the service-role client at all. Also review the other service-role mutators listed in P0-D.

## P0-B — money paths added after migration 079
These are workspace-only at BOTH layers today. A `readonly` member can:
- **create and edit transactions** — `POST /api/budget/line-items/[id]/transactions`, `PATCH /api/budget/transactions/[id]` (`budget_line_item_transactions` gates only DELETE on `is_workspace_admin()`, mig 104:50-62). This is the path receipts use to move money into `actual_cost`.
- **change FX rates** — `POST/DELETE /api/budget/fx-rates`, `POST /api/budget/exchange-rate`. Every converted figure in the P&L depends on these.
- **redefine rate types** — `POST/PATCH/DELETE /api/budget/rate-types`, `PATCH /api/budget/rate-lines`, which drive payroll math.
- **create budget versions** — `POST /api/budget/versions` (mig 212:215 is `FOR ALL` workspace-only).
- **write settlement itemization** — `settlement_deductions/expenses/payments` (mig 243:77-92) are workspace-only even though the `settlement` header is strict-gated. Split guard on one feature.
- **bulk-write a budget** — `POST /api/budget/templates/apply`, `POST /api/import/workbook` + `/apply`.
- **write line-item notes and attachments** — not strict-gated.

Gate each to the same standard as the 9 existing money tables. **Extend `can_access()` policies rather than inventing a new mechanism**, and re-run the money harnesses (64/21/15) after — the guards must not change any computation.

## P0-C — the systemic fix, so this can't regrow
1. **One guard helper, used by every mutating route.** Extend `requireUserAndWorkspace` into `requireWrite(resource)` (or add a sibling) returning `{user, workspaceId, membership, grants}` and 403-ing when the role/grant fails. Route code should read one line.
2. **An enumerating test** — walk `src/app/api/**/route.ts`, find every exported POST/PATCH/PUT/DELETE, and assert each either calls the guard or appears on an explicit, commented allow-list (public token routes, cron, self-scoped profile writes). **A new mutating route with no guard must fail CI.** This is the same shape as the middleware allow-list invariant, which is what stopped that class recurring.
3. **A migration convention**: any new table's write policies must carry a role predicate, with the allow-list documented in the migration header. Note in `database/migrations/README.md`.

## P0-D — two role models coexist. Adam decides.
- `can_access()` (mig 079:164) = `role IN ('admin','manager') OR has_permission(...)` — **manager can write.**
- `is_workspace_admin()` = `role = 'admin'` — **manager cannot.** Used in ~135 policy clauses across ~40 tables (rooms, flights, gear, persons, spaces, containers, stage_plots, rider_*, rental_*, tour_roles, workspace_members, invites…).

So today a manager can edit budget line items but not a hotel booking. That's incoherent rather than deliberate. **Adam's call:** what may a manager write? My recommendation — manager writes everything operational, admin-only for membership/permissions/billing/destructive-global (canonical venues, workspace settings). Then converge the ~135 clauses onto one predicate.

Also review the service-role mutators for missing role checks: `PATCH /api/venues/canonical/[id]` (P0-A), `POST /api/ai/rag/ask` (workspace filter is in the query, not RLS — verify it can't be coerced), `PATCH /api/ai/preferences` (self-scoped, looks fine).

## Sequence
P0-A (small, cross-tenant) → P0-B (money) → P0-C (helper + CI test + convention) → P0-D after Adam rules on manager. **The UI capability work — hiding write affordances for readonly — comes AFTER all of this and is courtesy, not enforcement.** A hidden button on an unguarded endpoint is not a fix.

## Gates
Money harnesses 64/21/15 green after P0-B (guards must not move math) · the P0-C enumerating test is the deliverable, not optional · migrations idempotent, paste-gated on Adam · raw git evidence + Vercel per bank. **Acceptance is the readonly account: after P0-A/B, the same session that created an artist must be refused by the API, not just by a hidden button.**
