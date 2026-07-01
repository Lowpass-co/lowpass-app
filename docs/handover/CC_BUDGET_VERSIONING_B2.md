# CC — Budget Versioning B2 (the UI). B1 is on main + verified LIVE.

B1 (data + state + endpoints + guards) is merged to `main` (`04c2cb1`) and I verified the
whole contract against the live DB — approve locks, a proposed write returns `423
VERSION_LOCKED`, actual writes still pass, unlock restores draft, and a rejected write
leaves the numbers untouched. **The data layer is solid; B2 is UI wiring on top of it.**
Don't touch migration 212, the RPCs, or the route guards — build the surfaces that drive them.

## The contract you're wiring to (already live, do not re-implement)
- `GET /api/budget/versions?tour_id=` → `{versions:[{id,version_number,status(draft|approved|superseded),approved_by,approved_at,note,parent_version_id}]}`. Backfilled **draft v1** exists per tour.
- `POST /api/budget/versions/[id]/approve` → locks (status `approved`, becomes Current). Approver-gated.
- `POST /api/budget/versions/[id]/unlock` → `approved`→`draft`.
- `POST /api/budget/versions/[id]/amend` → clones latest approved → new **draft v(n+1)**, prior → `superseded`.
- `POST /api/budget/versions` → scaffold v1 if absent.
- Proposed write to an approved version (`/line-items`, `/income`) → **HTTP 423** `{code:'VERSION_LOCKED', error, versionId}`. Actual-only writes pass.
- `is_budget_approver()` = admin OR grant (no assign-UI this phase).

## ⛔ Light Stage A first (confirm mount points → `BUDGET_VERSIONING_B2_MAP.md`, short)
The IA/placement is in `BUDGET_VERSIONING_MAP.md` §5, but confirm against the **current**
code before building (don't assume):
1. **Version selector + Current pill** mount: confirm it's `BudgetContextBand` (the budget
   sub-bar with Summary/Expenses/Income/Settings tabs + currency/Export). Name the slot.
2. **Approve / Unlock / Amend actions** location: the map says the **Settings tab** for
   approve/unlock + the note field; the selector dropdown for switch/amend. Confirm the
   Settings tab component + where to add them.
3. **Grid lock wiring**: confirm how `budget/[tourId]/page.tsx` already resolves the active
   version + locked status (B1 added this for the proposed overlay) and how it threads to
   `BudgetGridView` → `<Grid>`. You'll add a `versionLocked` prop alongside the existing
   derived-lock at `Grid.tsx:1457-1460`.
4. **Income**: confirm `budget/[tourId]/page.tsx` loads `budget_version_income` and how
   `BudgetIncomeGrid` receives proposed values (it must read the active version's income
   snapshot, not `budget_income.pre_tax_*`).
Surface anything that doesn't match the map. Then build.

## B2 deliverables
1. **Version selector** in `BudgetContextBand` — a `v1 · draft ▾` control listing versions
   (number + status). Selecting a non-active version views it **read-only**. The approved
   version carries a **"Current" pill** (token-clean: orange = approved/current, muted =
   draft, grey = superseded) — in the dropdown AND as a persistent chip on the budget
   sub-bar.
2. **Read-only-when-locked proposed cells** — extend the Grid lock guard: when the active
   version is `approved`, proposed cells (est) render read-only (mirror the derived-lock
   visual). Actuals stay editable. Add this as an opt-in `versionLocked` prop, like
   `fillHandle` — don't hardcode.
3. **Unlock-or-New-Version prompt** — on a locked-proposed edit attempt, show a modal
   (reuse `GridModals` primitives): *"This budget is approved & locked — Unlock &
   re-approve, or Create a new version."* Buttons → `POST …/unlock` (→ refetch, editable)
   or `POST …/amend` (→ new draft v(n+1), switch to it). **Also catch a `423
   VERSION_LOCKED` API response and raise this same modal** — never a generic error toast.
   If the user isn't an approver, the modal explains it and offers no unlock/amend (read-only).
4. **Approve / Unlock / Amend controls** (Settings tab) — Approve (draft + approver →
   lock), Unlock (approved + approver), Amend/"New version from approved" (clone latest
   approved). Gate every control on `is_budget_approver()` (server already enforces; hide
   the affordance for non-approvers). Optional `note` field on approve.
5. **Income → version snapshot** — `BudgetIncomeGrid` reads proposed from
   `budget_version_income` (active version); actuals stay on `budget_income.actual_*`. P&L
   variance reads approved-version income vs actuals.

## Hard rules
- Don't regress: the Grid (formula/fill/menus/live totals), reconcile feeds, receipts,
  income P&L parity, the AI gate. Tokens (no hardcoded hex/px); `next build --webpack`;
  tsc 0; eslint 0. RLS/approver gating via the existing helpers.
- The AI "Add it" button is still a TODO — when it's built it must surface `423` as this
  same prompt; note it, don't build it here.
- **Verify before claiming** — name files/lines; push with the hash. I Chrome-verify on the
  preview: selector shows v1 draft; approve → Current pill + proposed cells read-only;
  edit a locked proposed cell → the Unlock-or-New-Version modal (not a toast); Unlock →
  editable; Amend → v2 draft clones v1 + v1 superseded + selector updates; income proposed
  comes from `version_income`; actuals editable while locked; non-approver sees no
  approve/unlock affordance.
- Land the BUD-VER smoke IDs in `docs/smoke-tests/budget.md` (approve/lock/unlock/amend/
  income-version) as they go green.
