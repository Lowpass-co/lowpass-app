# CC — Budget Versioning Phase 1 (the big one). Gated: Stage A map FIRST, no code.

This is the highest-blast-radius build since the grid overhaul — it touches the budget
data model, every budget surface, the reconcile feeds, and now the AI suggestion panel.
**Stage A is a data-model + state-machine MAP only. No schema, no UI, until it's
reviewed by Adam + Claude.**

## Decisions are LOCKED — read first, do not relitigate
`docs/handover/BUDGET_VERSIONING_DESIGN.md` §6 (Adam's answers). Summary:
- **Proposed** = versioned + lockable. **Actuals** = one live tour-level layer, NEVER
  versioned. Variance always vs the **approved** version.
- **Approve** locks the proposed (read-only) + tags it **"Current"** (pill in the
  version dropdown AND on every budget screen).
- The lock is **reversible**: editing a locked proposed value → prompt *"Approved &
  locked — Unlock & re-approve, or Create a new version."* **Unlock** makes it editable
  again (same version) → re-approve re-locks. Actuals keep flowing live either way.
- **Approver = a grantable "approver" status** (NOT just `is_workspace_admin`). Only
  members with it can approve / unlock / re-approve.
- **Amend = clone the latest approved** into a new draft; prior approved → **superseded**
  (kept for history).
- Derived feeds (Rooming→Accommodation, Payroll→Salary) **post-lock flow to actuals**,
  not the locked proposed.

## ⛔ Stage A — MAP ONLY → `docs/handover/BUDGET_VERSIONING_MAP.md`

1. **Current model.** Map `budget_line_items` / `budget_sections` / the `est`/`act`
   fields / the reconcile feeds (`reconcileDerivedBudgetLines`) / income
   (`budget_income`). Identify precisely **what is "proposed" (gets versioned)** vs
   **what is "actual" (stays one live layer)**.
2. **Versioning schema.** Propose `budget_versions` (per `BUDGET_VERSIONING_DESIGN.md`
   §2: id, tour_id, version_number, status draft|approved|superseded, parent_version_id,
   created_by/approved_by/approved_at, note). **Resolve the schema sub-decision (§2):**
   (a) snapshot the full proposed section/line set per version + key actuals to a stable
   tour-level line identity, vs (b) one line set + a per-version proposed-values side
   table. Recommend one, with the variance-join + actuals-attachment consequences spelled
   out. This is the crux — get it right.
3. **Approver grant.** How the "approver" capability is stored + gated. Mirror the
   pattern in migration `060_roles_wiring.sql` (self-vs-admin RLS) and how
   `is_workspace_admin()` is used. **Make it grantable + gated; do NOT build the
   assignment UI in this phase** (note it as a follow-up surface, like the AI ticket
   deferred `/settings/team`). Gate approve/unlock/re-approve on it server-side.
4. **State machine.** draft → approve (lock, becomes Current) → {unlock → edit →
   re-approve} | {amend → clone latest approved to new draft; prior → superseded}. Map
   the API endpoints + the server guards.
5. **Lock enforcement + the prompt.** Where the proposed becomes read-only (mirror the
   derived-lock guard at `Grid.tsx:1457-1460`, now extended to "this version is
   approved"); the **Unlock-or-New-Version** prompt on an edit attempt; the **"Current"
   pill** placement (dropdown + screens); the **version selector** on the Budget nav.
6. **The AI-suggestion seam (now real on main).** A rules-finding / AI suggestion's
   "Add it" action (or the suggest panel) targeting a **locked** version must hit the
   **same** Unlock-or-New-Version gate as a manual edit — an AI nudge can't bypass the
   lock. Map where that intercept goes (the suggestion's write path → the lock check).
7. **Blast radius.** List every surface that needs version-awareness: Grid (Expenses),
   Income, Summary/P&L (variance vs approved), the reconcile feeds (→ actuals post-lock),
   the AI panel. Flag anything that breaks if it isn't version-aware.
8. **Migration number.** 210 is now on `main`; pick the next free ≥211 (verify across
   feature branches per `database/migrations/README.md`).

Surface every decision + the recommended resolution. **Then stop.**

## Stage B (after the map is approved) — land in sub-pushes
- **B1 — data + state:** `budget_versions` + the proposed/actuals split + the approver
  grant + the lock/unlock/approve/amend endpoints + server guards. Migration idempotent,
  down-block, applied via `npm run db:migrate`.
- **B2 — UI:** version selector on the Budget nav + the "Current" pill everywhere +
  read-only-when-locked proposed + the Unlock-or-New-Version prompt + the AI-suggestion
  intercept.

## Hard rules
- Don't break: the Grid (formula/fill/menus/live totals just shipped), the reconcile
  feeds, the AI gate, income P&L parity. Tokens; `next build --webpack`; tsc 0; eslint 0.
- RLS via `get_my_workspace_id()` / the new approver gate — never inline workspace SQL.
- **Verify before claiming** — name files/lines; push each B with its hash. I
  Chrome-verify: create v1 → approve (locks + Current pill) → edit a proposed cell →
  Unlock-or-New-Version prompt → unlock + re-approve; amend → v2 clones v1, v1 becomes
  superseded; actuals stay editable on a locked version; variance reads vs the approved
  baseline; an AI suggestion can't write to a locked version without the prompt.
