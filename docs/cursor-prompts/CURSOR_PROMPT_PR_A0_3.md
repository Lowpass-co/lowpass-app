# Cursor Prompt — PR A0.3: AppTopBar responsive pass + mobile focus-order fix

Paste this whole file into Cursor. Execute in order. Do not skip steps. Do not add scope beyond what is listed. If a step is ambiguous, stop and ask rather than guessing.

---

## Design references (standing — applies to this and all future Lowpass PRs)

Lowpass's design vocabulary draws from three products. Keep these in mind when resolving any ambiguity:

1. **Daysheets (daysheets.com, the tour management app)** — visual cues. Clean, spacious, typography-forward, minimal chrome. Schedule/day layouts that prioritise legibility and at-a-glance scanning. When in doubt about spacing, font weight, hierarchy, or "how much chrome", lean toward the Daysheets aesthetic (airy over dense).
2. **Xero** — budget UX. Source of truth for how budget pages behave: inline edits, per-row running totals, clear category grouping, cell-level precision over modal dialogs. Relevant for Phase A1 (routing/income merge) and the later budget work.
3. **Notion** — context menus. Every reasonable page should support a context menu for quick row-level actions (duplicate, delete, move, convert). Triggers: right-click **and** a visible kebab/`⋯` affordance on row hover. Keyboard accessible.

For this PR (A0.3) these references are **orientation-only** — no visual redesigns happen here. The pass is responsive behaviour + focus order. Visual language comes into play in Phase E/F.

---

## Context

PR A0.1 shipped `AppTopBar` with a two-row mobile layout: breadcrumb + actions on row 1, pill on row 2. That layout works but introduces a focus-order regression — on <768px viewports the tab order is **breadcrumb → bell → dark-mode → pill**, i.e. the pill (primary nav control) comes after decorative icons. Screen-reader and keyboard users hit the pill last.

A0.2 removed the duplicate sidebar toggle, so the top-bar pill is now the single source of truth for Advance↔Budget mode. That makes the focus-order bug more acute: the main nav control is where users land last.

This PR collapses the layout back to a single responsive row. The pill uses a narrower fixed width on mobile (`w-40`) and a wider one from `md:` up (`md:w-48`), and sits between the breadcrumb (which truncates) and the actions cluster. Minimum touch target on all interactive pill/button elements is 44×44 per iOS/Android accessibility guidance.

Also: add a shared `useIsMobile` hook so downstream PRs have a consistent breakpoint source instead of ad-hoc `window.matchMedia` calls.

No route changes, no API changes, no new dependencies.

---

## Goal

1. Create `src/hooks/useIsMobile.ts` — reusable breakpoint hook.
2. Restructure `src/components/layout/AppTopBar.tsx` to a single-row layout on all viewports.
3. Truncate the breadcrumb under `md:` with `text-ellipsis` overflow so it doesn't push the pill offscreen.
4. Constrain the pill to `w-40 md:w-48`.
5. Enforce minimum 44×44 touch targets on the pill's two `<button>` elements and on each action icon button (bell, dark-mode toggle).
6. Tab order becomes: **breadcrumb → pill → bell → dark-mode**. Pill is reached before decorative actions.
7. Verify the sidebar drawer (opened from the hamburger in `AppShell`) still works — don't regress.

---

## Files to modify / create

### 1. `src/hooks/useIsMobile.ts` (NEW)

```ts
'use client';

import { useEffect, useState } from 'react';

/**
 * Returns true when the viewport is narrower than the Tailwind `md` breakpoint (768px).
 * SSR-safe: returns `false` during server render, updates after hydration.
 *
 * Use this anywhere downstream code branches on "mobile vs desktop" layout.
 * Prefer this over ad-hoc `window.matchMedia` calls for consistency.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isMobile;
}
```

### 2. `src/components/layout/AppTopBar.tsx` (REWRITE the layout JSX only)

Keep all existing imports, props, and child-component wiring. Only the outer JSX structure and the pill-row wrapper change.

Target structure (single row, three zones):

```tsx
<header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-lp-border bg-lp-surface/80 px-3 backdrop-blur md:px-4">
  {/* Zone 1: breadcrumb (flex-1, truncates) */}
  <div className="min-w-0 flex-1">
    <AppTopBarBreadcrumb />
  </div>

  {/* Zone 2: mode pill (fixed width) */}
  <div className="shrink-0">
    <AppTopBarModePill className="w-40 md:w-48" />
  </div>

  {/* Zone 3: actions (shrink-0, fixed-size icon buttons) */}
  <div className="flex shrink-0 items-center gap-1">
    {/* existing bell + dark mode buttons, each wrapped in a 44×44 hit target */}
  </div>
</header>
```

Hard requirements for the rewrite:

- `<AppTopBarBreadcrumb />` wrapper gets `min-w-0 flex-1` (so its inner text can truncate) and no explicit width. The breadcrumb component itself should already use `truncate` on its text spans — if it doesn't, fix it there (add `className="truncate"` on each span that holds the artist/tour label, and wrap the parent in `flex min-w-0 items-center gap-2`).
- `<AppTopBarModePill />` accepts an optional `className` prop merged onto its root `<div>` via `cn()`. If the existing component doesn't accept a className prop, add one (type it as `className?: string`). Apply `w-40 md:w-48` when rendered by `AppTopBar`.
- The pill's two `<button>` children (Advance / Budget) must each have `h-9 min-w-[44px]` (or equivalent `py-2`) so the hit target is >=44×44 even on mobile where the pill is 160px wide (each button ≈80px wide × 44px tall).
- Bell and dark-mode icon buttons wrap in `<button className="grid h-11 w-11 place-items-center rounded-lg text-lp-text-secondary hover:bg-lp-surface-hover">…</button>`. 44×44 exactly.

### 3. Tab/focus order

In the final DOM, the focusable interactive elements must appear in this order:

1. Breadcrumb's artist dropdown trigger
2. Breadcrumb's tour dropdown trigger
3. Pill — Advance button
4. Pill — Budget button
5. Bell
6. Dark-mode toggle

Do **not** use `tabIndex` to force this — rely on natural DOM order, which matches the JSX above. If any component injects a portal or a focus trap that breaks the order, stop and report.

### 4. Breadcrumb truncation (if not already in place)

Open `src/components/layout/AppTopBarBreadcrumb.tsx`. The artist and tour label spans should render with:

```tsx
<span className="truncate">{artist?.name ?? 'Select artist'}</span>
```

And the breadcrumb's root must be `flex min-w-0 items-center gap-2`. Without `min-w-0` the truncation doesn't kick in inside a `flex-1` parent.

---

## Hard rules — do not break

1. Do **not** modify `AppTopBarModePill.tsx`'s state logic (localStorage read/write, pathname sync). Only add a `className` prop if missing and merge it into the root element.
2. Do **not** remove the two-row layout wholesale by introducing a "mobile only" rendered variant — single DOM tree, Tailwind-only responsiveness.
3. Do **not** touch `Sidebar.tsx`, `AppShell.tsx`, or routing files. The sidebar drawer open/close lives elsewhere and is fine.
4. Do **not** add framer-motion, headless-ui, or any other dependency.
5. Do **not** change the pill's visual design (pill background, translateX indicator animation). The width changes, the internals don't.
6. Do **not** set `overflow-hidden` on the `<header>` itself — that would clip dropdowns from the breadcrumb.

---

## Acceptance criteria (run through each before finishing)

- [ ] `npx tsc --noEmit --skipLibCheck` is clean.
- [ ] `npm run lint` adds no new errors on `AppTopBar.tsx`, `AppTopBarBreadcrumb.tsx`, or `useIsMobile.ts`.
- [ ] `npm run dev` boots with no console errors.
- [ ] Open `/dashboard` at 1920×1080: top bar renders as one row — breadcrumb (left) → pill (~192px, center-ish) → bell + dark-mode (right). No overflow.
- [ ] Resize to 768px: same structure, breadcrumb starts using ellipsis if artist/tour names are long. Pill still visible. Bell + dark-mode still visible. No horizontal scroll.
- [ ] Resize to 375px (iPhone SE): pill shrinks to 160px (`w-40`). Breadcrumb truncates aggressively. All 3 zones still on one row. No horizontal scroll on the whole page.
- [ ] Tab through the top bar from a cold reload (press Tab repeatedly). Order is: artist trigger → tour trigger → Advance → Budget → Bell → Dark-mode. **Pill is reached before the decorative icons.**
- [ ] Click Advance then Budget in the pill — URL and sidebar mode switch correctly (behaviour unchanged from A0.1).
- [ ] Hamburger in `AppShell` still opens the sidebar drawer on mobile (behaviour unchanged).
- [ ] Pill buttons have visible hover/active states, minimum 44×44 touch targets (inspect in devtools — each button >=44px tall, pill width 160px / 2 = 80px wide > 44px).
- [ ] Bell and dark-mode buttons are 44×44 exactly.
- [ ] `git grep -n 'useIsMobile' src/` shows the new hook is exported and imported from at least `AppTopBar.tsx` (if used there) — if you don't end up needing it in `AppTopBar.tsx` itself, that's fine, it's added for downstream PRs. Leave it present, unused-in-this-PR is OK.
- [ ] No residual `flex-col` or `md:flex-row` leftover on the header — single-row only.

---

## Verification commands (run after implementation)

```bash
npx tsc --noEmit --skipLibCheck
npm run lint
git grep -n 'useIsMobile' src/
git grep -n 'md:flex-row\|flex-col' src/components/layout/AppTopBar.tsx
# Expected: the second grep returns empty (no responsive column/row switching on the top bar anymore).
```

Then smoke-test in a browser at 1920, 768, and 375 widths using devtools device emulation.

---

## Out of scope for this PR (explicitly defer)

- Deleting `HeaderArtistTourPicker.tsx` + `Header.tsx` → **PR A0.4**.
- Renaming `lp-sidebar-mode` localStorage key with migration → **PR A0.4**.
- Any visual redesign of the pill, breadcrumb, or action icons → not happening until Phase E/F UI pass.
- Global mobile drawer polish (animation easing, backdrop blur tuning) → separate pass.
- Using `useIsMobile` inside existing components that still branch on `window.innerWidth` → sweep lives in A0.4.

---

## Output format expected from Cursor

1. File tree diff — expect `src/hooks/useIsMobile.ts` (new), `src/components/layout/AppTopBar.tsx` (modified), possibly `src/components/layout/AppTopBarBreadcrumb.tsx` (modified if truncation needed), possibly `src/components/layout/AppTopBarModePill.tsx` (modified to accept `className`).
2. Output of `npx tsc --noEmit --skipLibCheck` (should be empty = success).
3. Output of `npm run lint` scoped to the touched files.
4. Output of the two `git grep` verification commands.
5. A short note on any deviations from the prompt with justification.

Then stop. Do not auto-continue into A0.4.
