# BUDGET_VERSIONING_B2_MAP — light Stage A (mount points confirmed)

> B1 (data + state + guards) is on `main` (`04c2cb1`, now under the RAG merge
> `fe2f1f0`) + live-verified. B2 = UI wiring only. Confirmed against current code
> — matches `BUDGET_VERSIONING_MAP.md` §5. No mismatches.

## Confirmed mount points
1. **Version selector + Current pill → `BudgetContextBand.tsx`** (the budget
   sub-bar `<ProductSubBar>`; `leftSlot`=TourIdentityChip, `items`=tabs,
   `cornerItems`=Settings, `rightSlot`=density+Export). Add the selector + pill in
   the **leftSlot, beside the identity chip**. Band props extend with
   `versions`, `activeVersion`, `canApprove`.
2. **Approve / Unlock / Amend → `BudgetSettingsTab.tsx`** (`'use client'`, card
   layout: OverheadsCard / CommissionsCard / sections). Add a **"Versions &
   approval" card** (approve+note / unlock / amend), gated on `canApprove`. Page
   passes `versions`, `activeVersion`, `canApprove`.
3. **Grid lock → `page.tsx:260` resolves `activeVersion`** (B1, for the proposed
   overlay). Add `versionLocked = activeVersion?.status === 'approved'` + thread
   to `BudgetGridView` → `<Grid versionLocked onLockedEdit=…>`. Grid locks the
   `est` (proposed) cell when `versionLocked` (mirror the derived-lock at
   `renderCell` ~`:1457-1460`); `act` stays editable.
4. **Income → already version-aware (B1).** `page.tsx:260-275` overlays
   `budget_version_income` onto `initialIncome`; `BudgetIncomeGrid` gets it via
   `initialRows`. B2 only adds **read-only-when-locked**: pass `versionLocked` →
   set `ro:true` on the projected money columns (guarantee/wh/overage/merch/vip).

## Approver check (server)
`page.tsx` resolves `canApprove` via `supabase.rpc('is_budget_approver')` (admin
OR a grant; reads `auth.uid()`/`get_my_workspace_id()`). Non-approvers: the
selector still shows + views read-only, but no approve/unlock/amend affordance.

## View-a-past-version (read-only)
Selector sets `?version=<id>`. The loader, when `?version` is a valid non-active
version, overlays proposed from THAT version + forces `versionLocked=true` (any
non-active version, incl. drafts you're not editing, renders read-only). Default
(no `?version`) = the active head.

## B2 build order
page loader (versions list + canApprove + ?version) → Grid `versionLocked`/
`onLockedEdit` → BudgetGridView modal + 423-catch → BudgetContextBand selector +
pill → BudgetSettingsTab approval card → BudgetIncomeGrid read-only.

**AI "Add it"** stays a TODO — when built it must surface 423 as this same modal
(noted, not built). Smoke: BUD-VER-07..12 in `budget.md`.
