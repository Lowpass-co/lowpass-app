# CC — Versioning STATE/NAV **B2: rollback**. Stage B (build). Branch off `main` AFTER B1 merges.

B1 (`feat/versioning-state-fix-b1`, `c2e2414`) is **Chrome-verified + approved to merge**. B2
adds the rollback flow: make an older version Current again, marking everything newer
`rolled_back`. The DB model from migration `212` is sound — B2 is **one new status + one RPC +
one endpoint + the confirm-modal wiring**. No snapshot tables are touched (status-only changes),
so the immutability trigger is untouched and the approver guard already covers it.

## Branch
- **Branch off `main` once B1 is merged.** First run `git log origin/main` and confirm it
  contains `c2e2414` (the B1 fix). **If B1 is not yet on `main`, branch off
  `origin/feat/versioning-state-fix-b1` instead** so B2 stacks on the threaded-`viewed` state.
  State which base you used in your report.
- New branch: `feat/versioning-rollback-b2`.

## What rollback means (the spec)
Adam selects an older, non-draft version in the selector and chooses **"Make this version
Current."** A confirm popup enumerates the consequence, then on confirm: the chosen version `vN`
becomes the approved **Current** (locked baseline), and **every version newer than it — plus the
former Current — becomes `rolled_back`** (including any in-progress draft head; that draft work is
discarded — the modal must say so explicitly). To edit after a rollback you Unlock the new Current
or amend it, exactly like any approved Current.

## Decisions — LOCKED
- **New status `rolled_back`** (not a flag on `superseded`). It is a distinct historical state so
  the selector can badge it ("rolled back") and the timeline reads truthfully.
- **`rolled_back` behaves like `superseded` for viewing**: selectable, viewable, **read-only**
  (all proposed cells locked), and its lock modal is status-aware — "You're viewing a historical
  (rolled-back) version. Switch to the draft to edit" — PLUS it offers **"Make this version
  Current"** (the rollback entry point), same as a `superseded` version does.
- **Rollback target rules:** target must be **non-draft** and **not already the approved Current**.
  Rolling *backward* (target number < Current) and rolling *forward* (re-selecting a higher-numbered
  `rolled_back`/`superseded` version) must both work.
- **Confirm modal enumerates** every affected version by number + current status, e.g. "This marks
  **v1** as Current. **v2 (superseded), v3 (draft — unsaved working copy)** will be marked
  rolled-back." The draft-loss warning is the safety gate — do not auto-dismiss.

## Build

### 1. Migration `218_budget_version_rollback.sql` (next free number — 217 is the high-water mark on `main`; no 218 exists on any branch — re-confirm before writing)
- **Widen the status CHECK.** In `212` it's an inline (auto-named) check. Confirm the constraint
  name from `pg_constraint` (`budget_versions_status_check` unless Postgres named it otherwise),
  then:
  `ALTER TABLE public.budget_versions DROP CONSTRAINT IF EXISTS budget_versions_status_check,
   ADD CONSTRAINT budget_versions_status_check CHECK (status IN ('draft','approved','superseded','rolled_back'));`
  Idempotent.
- **`budget_version_rollback(p_version_id uuid)` RPC** — mirror the style of
  `approve_budget_version` / `amend_budget_version` in `212` (lines 280–360):
  1. `IF NOT public.is_budget_approver() THEN RAISE EXCEPTION …` (approver gate).
  2. Load target `v` (id + `workspace_id = public.get_my_workspace_id()` scope). `IF v IS NULL …`.
  3. Guard: `IF v.status = 'draft' THEN RAISE EXCEPTION 'cannot roll back to the working draft'`.
     `IF v.status = 'approved' THEN RAISE EXCEPTION 'this version is already Current'`.
  4. **Demote FIRST, promote LAST** (so the `budget_versions_one_approved_per_tour` partial unique
     index never sees two `approved`):
     `UPDATE public.budget_versions SET status='rolled_back', approved_by=NULL, approved_at=NULL,
        updated_at=now()
      WHERE tour_id = v.tour_id AND id <> v.id
        AND (status = 'approved' OR version_number > v.version_number);`
     — the `status='approved'` clause catches the former Current even when it is **not** the
     highest number (the roll-forward case); the `version_number >` clause catches everything newer
     including the draft head.
  5. Promote target:
     `UPDATE public.budget_versions SET status='approved', approved_by=auth.uid(),
        approved_at=now(), updated_at=now() WHERE id = v.id;`
  6. Return the updated row (or the tour's version list, matching what `approve` returns).
  - The `guard_version_status_change` trigger fires per row: both the demotions (out of `approved`)
    and the promotion (into `approved`) are approver-gated — covered by step 1's gate running in the
    same txn. The `deny_write_on_locked_version` trigger is on the **snapshot** tables only; this RPC
    writes `budget_versions.status` exclusively, so frozen snapshots stay frozen. **Confirm both
    triggers are satisfied — do not weaken either.**
- Down-migration block at the end (revert the CHECK to the 3-value set; `DROP FUNCTION IF EXISTS
  public.budget_version_rollback(uuid)`).

### 2. Endpoint `src/app/api/budget/versions/[id]/rollback/route.ts`
Thin wrapper, identical shape to `…/approve/route.ts` (auth → `supabase.rpc('budget_version_rollback',
{ p_version_id: id })` → `rpcErrorStatus(error.code)` via `../../_rpc-status`).

### 3. UI wiring (on top of B1)
- **`VersionSelector.tsx`**: include `rolled_back` versions in the list with a "rolled back" badge;
  keep them selectable + viewable.
- **`VersionApprovalCard.tsx`** (already keys off `viewed` after B1): when `viewed` is a
  `superseded` **or** `rolled_back` version, render a **"Make this version Current"** action that
  opens the confirm modal. (Approved Current keeps Unlock/New-version; draft keeps Approve & lock.)
- **`VersionLockModal.tsx`** (already status-aware after B1): for a historical version add the
  "Make this version Current" path alongside "Switch to the draft to edit". The confirm step shows
  the enumerated affected-versions list + the draft-loss warning, then POSTs `…/rollback`.
- Read-only viewing of `rolled_back` reuses the exact non-draft lock path B1 built — **no new lock
  code**, just include `rolled_back` wherever `superseded` is already treated as locked/historical.

## Hard rules
- **Branch off `main` after B1 merges (else off `feat/versioning-state-fix-b1`). Commit + PUSH.
  Confirm `git log origin/feat/versioning-rollback-b2` has the commit before reporting.**
- **Migration number: re-confirm 218 is free across `main` + all active branches before writing**
  (collisions have bitten three times — see `database/migrations/README.md`). Mirror the number in
  the file header.
- Don't regress B1 (the threaded `viewed`, the income actuals-never-lock, the configurable
  `versionLockedCols`→modal) or B1-versioning (approve/unlock/amend RPCs, the one-approved index,
  the immutability + approver triggers, the 423 guard, the snapshot overlay) or the income phases.
- Tokens; `next build --webpack`; `tsc` 0; `eslint` 0.
- New smoke IDs in `docs/smoke-tests/budget.md` (VER-RB-01…): roll back v3→v1 marks v2/v3
  rolled_back + v1 Current/locked; the draft head is rolled_back with a warning; rolled_back version
  is read-only + viewable; roll forward (re-select a rolled_back higher version) works; non-approver
  is blocked; the one-approved index never trips (no two approved mid-txn).
- **Verify before claiming** — name files/lines; push the hash; reproduce a rollback end-to-end.
  I Chrome-verify: select an old version → "Make this Current" → confirm modal lists the affected
  versions incl. the draft → confirm → v1 is Current/locked, v2/v3 badged rolled_back, all four tabs
  agree; a rolled_back version opens read-only with the "switch to the draft" modal; a non-approver
  sees no rollback action.
