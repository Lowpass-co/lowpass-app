# VERSIONING_STATE_MAP — Stage A (map + fix plan only; no code)

> Adam's live use exposed that the **viewed budget version isn't a consistent,
> persistent source of truth** across the four tabs: the version # doesn't feel
> sticky, lock state disagrees between Expenses / Income / Settings, an old
> version can't be viewed read-only, there's no rollback, income **actuals** lock
> (they must never), and a locked income cell shows a **toaster** instead of the
> Unlock/New-version **modal**.
>
> **Good news:** the DB model (migration **212**) is sound — this is almost
> entirely a **client state-resolution** fix (thread ONE viewed version
> everywhere) plus a small rollback add. **Status:** Stage A — map only. Awaiting
> Adam + Claude sign-off on the read-only-viewing model + the rollback-status
> decision before any code.

---

## 1. How "which version am I viewing" resolves today (per surface)

**Resolved once in `page.tsx`:**
- `activeVersion = resolveActiveVersion()` — the **head**: highest `version_number`
  with `status != 'superseded'` (`versions.ts:33-44`). So it's the **draft** when a
  draft exists, else the approved Current.
- `viewed = (?version= match) ?? activeVersion` (`page.tsx:278-280`).
- `versionLocked = !!viewed && viewed.status !== 'draft'` (`page.tsx:281`).
- **Overlay** (`page.tsx:283-300`): the viewed version's snapshot
  (`getProposedLineMap` / `getProposedIncomeMap`) is overlaid onto `lines` +
  `initialIncome` whenever `viewed` exists — so the proposed figures shown match
  the viewed version. (Runs for every tab, not tab-gated.)

**Threaded to the tabs:**
| Surface | Gets | Keys off |
|---|---|---|
| **Expenses** `BudgetGridView` | `versionLocked`, `lockedVersionId={viewed.id}`, `canApprove` (`page.tsx:410-412`) | **viewed** ✓ |
| **Income** `BudgetIncomeGrid` | `versionLocked` (`page.tsx:425`) | **viewed** ✓ (but no `onLockedEdit`/`lockedVersionId`) |
| **Summary** `BudgetSummaryTab` | `versionApproved={versionLocked}`, `versionLabel=v{viewed.n}` (`page.tsx:371-372`) | **viewed** ✓ |
| **Settings** `BudgetSettingsTab` → `VersionApprovalCard` | `activeVersionId={activeVersion.id}` (`page.tsx:439`) | **active HEAD** ✗ |
| **Selector** `VersionSelector` (in `BudgetContextBand`) | `viewedVersionId={viewed.id}` (`page.tsx:345`) | **viewed** ✓ |

### Why the tabs disagree — the root cause
`viewed` IS resolved once and threaded to Expenses/Income/Summary/Selector — so
within a single page render those **cannot** show different lock states. The
disagreement comes from **two real defects**:

1. **Settings ignores `?version=`.** `VersionApprovalCard` keys off
   `activeVersionId` (the head), so it always shows the head's status + actions
   (`VersionApprovalCard.tsx:33` `active = versions.find(activeVersionId)`). When
   you're viewing approved **V2** (`?version=V2`) but the head is **draft V3**,
   Settings shows "v3 · draft" with an **Approve** button — not V2's **Unlock**.
   → "lock state inconsistent: V2 approved on Income but Settings shows Draft" and
   **"couldn't unlock V2"** (Unlock only renders when `active.status==='approved'`,
   `VersionApprovalCard.tsx:95`, and `active` is the draft head, not V2).
2. **The default `viewed` is the draft head, not the approved Current.** With an
   approved V2 + a draft V3 (e.g. right after "New version from approved", which
   pushes `?version=V3`, `VersionApprovalCard.tsx:109`), the no-`?version=` default
   is the **editable draft** — so Expenses "looks unlocked" while the user thinks
   they're on the approved Current. This is the "Expenses shows the active draft,
   ignoring the approved version" feeling.

**Navigation is NOT the culprit:** both the tab links (`BudgetContextBand.tsx:52-53`
`new URLSearchParams(searchParams)`) and the selector (`VersionSelector.tsx:52-57`)
**preserve `?version=`/`?tab=`**. (Still — §2 recommends auditing every other entry
into the budget page so nothing strips it.)

---

## 2. The single-source-of-truth fix (recommended)

**Make `viewed` the one value, resolved once, threaded IDENTICALLY to all four
tabs — including Settings.**

- **Fix Settings:** thread `viewedVersionId={viewed.id}` into `BudgetSettingsTab`
  → `VersionApprovalCard`, and have the card operate on the **viewed** version:
  show Approve only when `viewed` is a draft, Unlock/New-version only when `viewed`
  is the approved Current, and a read-only status line for a superseded/rolled-back
  view. Keep `activeVersion`/`approvedVersion` available for the "(Current: vN)"
  reference label, but **actions target `viewed`**.
- **Keep `?version=` as the home** of the viewed version (already is). Confirm
  EVERY internal navigation uses `URLSearchParams(searchParams)` so the param
  survives — audit `BudgetContextBand`, the burn-bar/export/report links, the
  product sub-nav/breadcrumb, and any `router.push`/`router.refresh` in the
  versioning actions (`VersionApprovalCard.act`, `VersionSelector.go`).
- **Default-view decision (Adam to confirm):** when no `?version=`, default to the
  **approved Current** if one exists (matches the "Current" mental model), with the
  **draft head** reachable + clearly labelled as the editable working copy — OR
  keep the head as default but make the selector + a persistent banner unmistakable
  about which version is shown and whether it's editable. *Recommend: default to the
  draft head (the editable working copy) BUT show a persistent "Viewing v{n} · {status}
  — Current is v{approved}" indicator so the state is never ambiguous.* This is the
  smallest behavioural change; the disagreement is fixed by the Settings thread, not
  by changing the default.

Net: lock state + the displayed snapshot + the selector + Settings all read the
same `viewed`, and it persists across tab changes (it already does in the URL;
Settings stops diverging).

---

## 3. Read-only viewing + selection

- **Read-only viewing already mostly works:** viewing any non-draft version →
  `versionLocked=true` → proposed cells read-only + the snapshot overlaid. The fix
  is to make it **complete + consistent**: every version in the selector is
  selectable + viewable (it is — `VersionSelector.tsx:99-119` maps all versions);
  the "couldn't select V1 / V2 unselectable" was the Settings/unlock confusion
  (§1.1), not the selector.
- **The editable cases are ONLY:** the **draft head's** proposed cells, and (always)
  **actuals** (§4). Approved Current / superseded / rolled-back → proposed
  **read-only**; the only state-changing affordances are in Settings (Approve a
  draft, Unlock the Current, Roll back to an old one).
- **Make the lock modal status-aware** (§4): on the approved Current → "Unlock or
  New version"; on a superseded/rolled-back view → "This is a historical version —
  switch to the current draft to edit" (no unlock).

---

## 4. Lock correctness (must-fix this pass)

### 4a. Actuals must NEVER lock
- **Expenses:** the Grid locks only `est` (`Grid.tsx` `startEdit` `versionLocked &&
  key === 'est'`); `act` is never locked. ✓ already correct.
- **Income:** the per-show **`currency`** column carries `ro: versionLocked`
  (`BudgetIncomeGrid.tsx:238`) and is spread into **both** the projected AND the
  actual column arrays → in the **Actual** view the currency dropdown is
  version-locked. That's an actuals-view cell locking. **Fix:** apply
  `ro: versionLocked` to `currency` (and every proposed input) **only in the
  projected view**; the actual view's columns (guarantee/overage/merch/vip already
  use plain `money()` — fine — plus currency) stay editable. Audit the income
  column builder so **no actual-view column** ever gets `ro: versionLocked`.

### 4b. The Unlock/New-version MODAL fires on an edit attempt — on BOTH grids
- **Expenses** already does it right: the Grid's `startEdit` (fires on Enter / type
  / double-click — an **edit attempt**, not a click) calls `onLockedEdit`, and
  `BudgetGridView` renders `<VersionLockModal>`.
- **Income** is wrong: its proposed cells use `ro: versionLocked` (silently
  un-editable → no callback), and the only feedback is a **toaster** on a 423
  (`BudgetIncomeGrid.tsx:196-197` `showToast('This budget is approved & locked.')`).
- **Fix (the seam):** generalise the Grid's version-lock from the hard-coded `est`
  to a **configurable set of proposed column ids**, firing `onLockedEdit` for any
  of them. Options: a `versionLockedCols?: string[]` prop (Expenses `['est']`;
  Income its proposed ids — guarantee/wh/overage/merch/vip/cap/sellthru/face/deal/
  dealpct/dealthr/dealabove/perhead/feepct/viptix/vipprice/currency), or a per-column
  `versionLockable?: boolean` flag. Then **Income**: drop the `ro: versionLocked` +
  the 423 toast, pass `onLockedEdit` + render `<VersionLockModal>` (mirroring
  `BudgetGridView`). Editing a locked proposed income cell → the modal, exactly like
  Expenses. The route's **423 stays as the server backstop** (don't remove it).

---

## 5. Rollback flow (Adam's spec)

**Spec:** select an older vN → "Make Current" → confirm *"This marks vN as Current;
later versions (vN+1…) will be marked rolled-back."* → the Current pill follows vN.

- **Status:** `budget_versions.status` is `CHECK (status IN ('draft','approved',
  'superseded'))` (`212:36-37`). **Recommend a new `rolled_back` status** (not
  reusing `superseded`) so the UI can show "rolled-back" explicitly per the spec.
  → **Migration 218:** widen the CHECK to include `'rolled_back'`; teach
  `resolveActiveVersion` to also exclude `rolled_back` from the head; add
  `rolled_back` to the `VersionStatus` union + `versionStatusColor` (grey, like
  superseded).
- **RPC / endpoint:** `POST /api/budget/versions/{id}/rollback` →
  `budget_version_rollback(p_version_id)` in ONE transaction, **approver-gated**:
  1. target vN must be a prior `approved`/`superseded`/`rolled_back` version of this
     tour;
  2. **demote the current `approved`** (if any) **first** → `rolled_back` (so the
     `budget_versions_one_approved_per_tour` partial unique index, `212:50-52`, is
     never violated mid-transaction), and mark every version with
     `version_number > N` (non-draft) → `rolled_back`;
  3. set **vN → `approved`** (Current).
  The status-change trigger (`guard_version_status_change`, `212:175-183`) already
  approver-gates any transition touching `'approved'` → rollback is gated for free.
  The immutability trigger (`deny_write_on_locked_version`, `212:141-152`) guards
  **snapshot writes**, not the `status` column — so re-approving an old version does
  **not** mutate its frozen `version_lines`/`version_income` (good — the rolled-back-to
  snapshot is exactly what was approved before).
- **UI:** in `VersionSelector` (or the Settings card), selecting a non-current
  version offers **"Make this Current"** → a confirm modal with the exact copy →
  call rollback → `router.refresh`. The Current pill + variance baseline
  (`resolveApprovedVersion`) follow vN automatically.

---

## 6. Blast radius (every surface that reads version/lock)

| Surface | Reads | Change |
|---|---|---|
| `page.tsx` | `viewed`, `versionLocked`, overlay (`262-300`) | thread `viewed` to Settings; (optional) default-view tweak |
| `BudgetGridView` (Expenses) | `versionLocked`, `onLockedEdit`, `VersionLockModal` | none (reference impl) |
| `BudgetIncomeGrid` (Income) | `versionLocked` | actuals never lock (§4a); add `onLockedEdit` + modal (§4b); drop the toast |
| `BudgetSummaryTab` | `versionApproved`/`versionLabel` | none (already viewed-keyed) |
| `BudgetSettingsTab` → `VersionApprovalCard` | `activeVersionId` → **`viewedVersionId`** | act on `viewed`; add Rollback (§5) |
| `VersionSelector` | `viewedVersionId` | add "Make Current"/rollback; show `rolled_back` |
| `BudgetContextBand` | hosts selector + tab nav | confirm param preservation; persistent "viewing vN" indicator |
| `Grid.tsx` | `versionLocked` (est-only) | generalise to `versionLockedCols` + fire `onLockedEdit` (§4b) |
| `server/budget/versions.ts` | resolve*/lock helpers | exclude `rolled_back` from head; add rollback helper |
| `versionApi.ts` + endpoints | approve/unlock/amend | add `rollbackVersion` + `/rollback` route |
| `income/route.ts`, `line-items/route.ts` | 423 lock guards (`resolveLockState`) | **unchanged** — keep proposed-only guards; actuals stay unguarded |
| DB `212` triggers + index, **218** | status CHECK + RPC | add `rolled_back`; new `budget_version_rollback` |

**Don't regress (B1/B2 + income):** the approve/unlock/amend RPCs + their endpoints,
the immutability trigger (`deny_write_on_locked_version`), the status-change
approver gate, the one-approved partial unique index, the 423 proposed-write guards
(line-items + income), the snapshot overlay, and the income phases (settlement
actuals, currency/FX, projection materialisation, P&L breakdown). The generalised
Grid lock must keep Expenses `['est']` behaviour byte-identical.

---

## Decisions to sign off (then Stage B)
- **Single source:** thread `viewed` to **all four** tabs incl. Settings; actions
  target the viewed version. *(Rec.)*
- **Default view:** keep the draft head as default + a persistent "Viewing v{n} ·
  {status} — Current v{approved}" indicator (vs defaulting to the approved Current).
  **Adam to choose.**
- **Actuals never lock:** income `ro: versionLocked` is **projected-view only**;
  audit so no actual-view column locks. *(Rec.)*
- **Modal on edit (both grids):** generalise the Grid version-lock to a column set
  firing `onLockedEdit`; Income renders `<VersionLockModal>`, drops the toast. *(Rec.)*
- **Read-only viewing:** any non-draft viewed version → proposed read-only; modal is
  status-aware (Unlock only on the approved Current). *(Rec.)*
- **Rollback:** new **`rolled_back`** status (migration **218**) +
  `budget_version_rollback` RPC + `/rollback` endpoint + the confirm modal. *(Rec.;
  vs reusing `superseded` — Adam to confirm the distinct status.)*
- **Migration 218** (next free; 215/216/217 = income phases on main; verify across
  branches at write time).
- **Phasing:** B1 = single-source thread (Settings → viewed) + income actuals/modal
  lock fix (no schema); B2 = rollback (migration 218 + RPC + UI). Each verifiable
  independently.

⛔ **No code.** Stopping for review.
