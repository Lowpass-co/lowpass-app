# Budget Versioning, Locking & Audit — design

Status: **DRAFT for Adam's decisions.** No code until the four open questions (§6) are
settled. This is the spec CC will be staged against.

## 1. Goal
Accurate tracking, reporting, and accountability. A budget that management approves
becomes a **locked baseline**; real spend (**actuals**) stays live; every change is
attributable. Variance = actuals vs the approved baseline.

## 2. The model (proposed)
Three concepts, kept deliberately separate:

- **Proposed** — what you plan to spend. **Versioned + lockable.** v1, v2, v3…
- **Actuals** — what you actually spent. **One live, tour-level layer. NOT versioned.**
  Always editable (incl. settlement-fed income actuals).
- **Approved baseline** — the latest *approved* version's proposed. Variance and
  reporting always run against this.

A **budget_version** record:
```
id, tour_id, version_number, status (draft|approved|superseded),
parent_version_id (the version it amends), created_by, approved_by,
approved_at, note
```
Lifecycle: a **draft** version is editable → **approved** locks its proposed
(read-only) → amending clones the latest approved into a new **draft** v(n+1);
the prior approved becomes **superseded** (kept, viewable, for history/reporting).

**The one schema detail to nail (sub-decision):** the *proposed* values are
version-scoped, but *actuals* attach to a **stable line identity** that survives across
versions (so variance can line up actual vs the approved proposed for "the same line").
Two ways: (a) snapshot the full proposed section/line set per version + key actuals to a
tour-level line identity; (b) one line set with a `version_proposed_values` side table +
tour-level actuals on the line. (a) is cleaner for immutability/audit; (b) is cleaner
for variance joins. Recommend (a) — decide once the feeds question (§3) is settled.

## 3. ⚠ The crux — derived feeds vs the lock (DECISION 1)
Today **Rooming → Accommodation** and **Payroll → Salary** auto-write the *proposed*
budget continuously. If approving locks the proposed, those feeds have nowhere to go.
Options when a version is locked and someone changes a rooming assignment / a payroll day:
- **(a)** it flows into **actuals only** (the locked proposed stays the baseline);
- **(b)** it auto-spawns/flows into a **draft v(n+1) proposed**;
- **(c)** it's **blocked** until you explicitly amend.

**Recommendation: (a).** Post-approval, the derived feeds update **actuals** (real cost
as rooming/payroll firm up); the approved proposed Accommodation/Salary stays frozen as
the baseline. To change the *proposed* Accommodation/Salary you **amend → new version**,
which re-derives the proposed from current rooming/payroll at that moment. Result: stable
baseline, live actuals, clean variance — and the auto-feeds never fight the lock.
(Pre-approval, the derived proposed behaves exactly as today.)

## 4. UI
- **Budget nav (hover):** "New budget" / "Amend previous budget" → a submenu of versions
  (select to view a past version read-only, or amend to create the next draft). The
  active version + status is shown (e.g. `v2 · approved`, `v3 · draft`).
- **Inside a budget — consistent tabs:** `SUMMARY | EXPENSES | INCOME | SETTINGS/GLOBAL`.
  When the active version is **approved/locked**, proposed columns render **read-only**;
  **actual** columns stay editable. A draft version is fully editable.
- **Right-click a cell → edit history** (Phase 2): user, timestamp, old→new per change.
- A version/lock indicator + an "Approve" action (gated by role — §6 Q3).

## 5. Phased build (so we don't boil the ocean)
- **Phase 0 — tab/layout polish (ship now, independent):** the consistent
  `SUMMARY | EXPENSES | INCOME | SETTINGS` tabs + general budget layout cleanup. No
  versioning dependency; pure UX win Adam already wants.
- **Phase 1 — versioning + lock + approval:** `budget_versions`, the
  draft→approved→superseded lifecycle, the nav version selector, read-only-when-locked
  proposed, always-editable actuals, derived-feeds-to-actuals-post-lock (§3a).
- **Phase 2 — audit trail:** append-only edit log (line/field/version, old→new, user,
  timestamp), user attribution, the right-click cell-history menu. Its own subsystem;
  layered on top of Phase 1.

## 6. DECISIONS — LOCKED (Adam, 2026-06)
1. **Derived feeds post-lock → actuals (§3 option a). YES** — plus the lock is
   **reversible** and surfaced:
   - When a user tries to change a **locked proposed** value (directly, or via a
     rooming/payroll change that would alter the proposed Accommodation/Salary), prompt
     them: *"This budget is approved & locked — **Unlock & re-approve**, or **Create a
     new version** (a duplicate of the current)."*
   - **Unlock** is a real action: unlock the approved version → it's editable again →
     **re-approve** to re-lock. (Alternative to branching a new version.)
   - Actuals continue to flow live regardless (option a).
   - The active/approved version shows a **"Current" pill** — in the version dropdown
     AND on every budget screen.
2. **Actuals unversioned. YES** — one live tour-level layer (expenses actuals +
   settlement-fed income actuals); variance always vs the approved version.
3. **Approver = a grantable "approver" status.** NOT just `is_workspace_admin`. A new
   **approver** capability that can be added to any role/member; only members with it can
   approve (lock) / unlock / re-approve. Needs the grant + a gate + UI to assign it.
4. **Amend = clone the latest approved** into the new draft; the prior approved becomes
   **superseded** (kept for history). Settlement→income-actuals lives in the same
   unversioned actuals layer.

### Net lifecycle (resolved)
`draft → approve (lock, becomes Current) →`
  • `unlock → edit → re-approve` (stays the same version, re-locked), OR
  • `amend → clone to new draft v(n+1)` (prior version → superseded; new one becomes
    Current on its approval).
Every locked-proposed edit attempt triggers the Unlock-or-New-Version prompt. The
"Current" pill marks the live approved version everywhere.
