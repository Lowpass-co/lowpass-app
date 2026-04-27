# Cursor Prompt — R6: Wire Rider Packs into the sidebar

Paste this whole file into Cursor. Execute in order. Do not skip steps. Do not add scope beyond what is listed. If a step is ambiguous, STOP and ask rather than guessing.

---

## Context

R1–R5 shipped the full Rider/Pack feature (DB, API, editor UI, public links, Google Doc export). But **no sidebar nav link was ever added**, so the only way to reach `/rider-packs` today is to type the URL manually.

This PR adds a single nav entry in the "Manage Tour" section: `Rider / Pack`. It links to `/rider-packs` (the global index page — not tour-scoped in the URL). Active-state highlighting matches both `/rider-packs` and `/rider-packs/[id]`.

Scope is deliberately tiny — one file, one section.

---

## Hard rules

1. **One file touched.** Only `src/components/layout/Sidebar.tsx`.
2. **No new dependencies.** The icon must come from `lucide-react` (already a dependency — add to the existing import line).
3. **No new `activeMode` strings elsewhere.** Add `'rider_packs'` as a new mode, match it in `isNavItemActive`.
4. **Strict TypeScript.** Zero `any`, no `@ts-ignore`.
5. **No re-ordering of other items.** Just insert the new entry in the right position.

---

## File list

**Edit (1):**

- `src/components/layout/Sidebar.tsx`

---

## Step 0 — Pre-flight output (A–D)

Before writing any code, output the following. If any check fails, STOP and report.

### A. Last commit on `main`

```
git log --oneline -1
```

### B. Sidebar.tsx is the right file

```
wc -l src/components/layout/Sidebar.tsx
grep -n "tourManagementItems" src/components/layout/Sidebar.tsx | head -3
grep -n "isNavItemActive" src/components/layout/Sidebar.tsx | head -3
```

Confirm ~464 lines and that both symbols exist.

### C. Routes that will be linked from the new nav entry

```
ls 'src/app/(app)/rider-packs/page.tsx'
ls 'src/app/(app)/rider-packs/[id]/page.tsx'
```

Both must exist.

### D. Existing lucide imports in Sidebar.tsx

```
sed -n '1,20p' src/components/layout/Sidebar.tsx | grep -A 3 "lucide-react"
```

Report the current lucide import line. You'll append `BookOpen` to it (or, if `BookOpen` is already imported, use it as-is without duplicating).

---

## Step 1 — Edit `src/components/layout/Sidebar.tsx`

Three small changes in this one file.

### 1a. Add `BookOpen` to the lucide-react import

Find the existing `from 'lucide-react'` import block. Append `BookOpen` to the list (alphabetical position: between `Bed` and `Building2`, or wherever alphabetical order dictates in the current list).

If `BookOpen` is already imported, skip this sub-step.

### 1b. Insert a new `NavItem` into `tourManagementItems`

Find the `tourManagementItems` array (currently around line 104). Today it contains 4 items in this order:

```tsx
const tourManagementItems: NavItem[] = [
  { label: 'Tour personnel', href: selectedTourId ? ... : '/budget', icon: Users2, activeMode: 'tour_personnel' },
  { label: 'Settlement', href: selectedTourId ? ... : '/budget', icon: FileCheck2, activeMode: 'settlement' },
  { label: 'Rooming', href: selectedTourId ? ... : '/budget', icon: Bed, activeMode: 'rooming' },
  { label: 'Payroll', href: selectedTourId ? ... : '/budget', icon: HandCoins, activeMode: 'payroll' },
];
```

Insert a new entry **immediately after `Tour personnel`** (before `Settlement`) so the final order is:

1. Tour personnel
2. **Rider / Pack** ← new
3. Settlement
4. Rooming
5. Payroll

The new entry must be **exactly** this:

```tsx
{ label: 'Rider / Pack', href: '/rider-packs', icon: BookOpen, activeMode: 'rider_packs' },
```

Notes:

- `href` is **not** tour-scoped. The `/rider-packs` index page is a global list (shows all packs for the workspace, regardless of tour). Do NOT add `?tour_id=...` or similar.
- The `activeMode` string `'rider_packs'` will be matched in Step 1c.

### 1c. Add matching logic to `isNavItemActive`

Find the `function isNavItemActive(item: NavItem): boolean` function (around line 162). It currently has a chain of `if (item.activeMode === '...')` checks.

Add this branch immediately after the `if (item.activeMode === 'tour_personnel')` block (so the relative order of existing branches is preserved):

```tsx
if (item.activeMode === 'rider_packs') {
  return /^\/rider-packs(?:\/|$)/.test(pathname ?? '');
}
```

This matches both `/rider-packs` (index) and `/rider-packs/anything` (editor, and any future sub-routes).

---

## Step 2 — Verification

Run all three:

```
npx tsc --noEmit
npx eslint src/components/layout/Sidebar.tsx
npx next build
```

All three must pass clean. For `next build`, report the final 10 lines.

Also do a manual sanity check:

- Reload the dev server and confirm the new "Rider / Pack" item appears in the sidebar, between "Tour personnel" and "Settlement".
- Click it. It should navigate to `/rider-packs` and highlight as active.
- Navigate to `/rider-packs/[id]` (by clicking any pack in the list, or typing a URL). The sidebar item should remain highlighted (because the regex matches sub-routes).
- Navigate away (e.g. to `/dashboard`). The sidebar item should lose its highlight.

---

## Final report format

Echo back exactly the following sections:

**Step 0 — Pre-flight output (A–D):** (paste outputs)

**Step 2 — Verification output:**
- `tsc --noEmit` exit code
- `eslint` exit code + warnings/errors count
- `next build` last 10 lines

**`git status -u --short`:** (paste)

**Any deviation from this prompt:** (if any — e.g. if `BookOpen` was already imported, if the line numbers shifted, if you made any judgment call)

**Final commit SHA:** (after you commit)

**Anything stopped on:** (or "nothing")

---

## Commit message

```
feat(nav): add Rider / Pack entry to sidebar (R6 nav wiring)

- Insert 'Rider / Pack' NavItem between Tour personnel and Settlement
- Link to /rider-packs (global index, not tour-scoped)
- Active state matches both /rider-packs and /rider-packs/[id]
- New lucide icon: BookOpen

No other changes. The /rider-packs route already exists from R2.
```
