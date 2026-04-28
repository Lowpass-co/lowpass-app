# Legacy Sidebar

Retained from the pre-UX02 era for reference only. Do **not** import from here.

## What lived here

- `Sidebar.tsx` — the original full-width left rail with branded LOWPASS lockup,
  collapsible state via `localStorage('lp-sidebar-collapsed')`, three rendered
  groups ("Artist Overview" / "Manage Tour" / Data + Equipment + Admin), and the
  account menu at the bottom. Roughly 470 lines.
- `SidebarTourPicker.tsx` — companion tour-picker that the legacy sidebar
  rendered when a tour was selected.

## Why it was retired

UX02 introduced `<TopBar>` and `<LeftRail>` as the standard navigation chrome
(see `src/components/shell/`). UX04 then migrated every page to wrap in
`<PageShell>`, which renders TopBar + LeftRail per archetype. After Phase 5 of
the recovery (April 2026), every `src/app/(app)/**/page.tsx` either uses
`<PageShell>` or — for `/m/*` — the dedicated mobile shell at
`src/app/(app)/m/layout.tsx`. The old Sidebar had no remaining importers.

Token references in `src/app/globals.css` (`--lp-sidebar-*`, `--sidebar-width`,
`--sidebar-collapsed-width`) are **kept** so that any future legacy or
admin-only surface that wants to reference the same colour palette can do so
without re-introducing tokens. They are not used by the active UX overhaul
chrome.

## If you need to bring it back

Don't. Add a new `LeftRail` variant in `src/components/shell/LeftRail.tsx` and
extend the per-archetype shells in `src/components/shell/app-page-shells.tsx`
instead. The active chrome is the only chrome.

## When this directory should be deleted

Once a release goes out without anyone discovering a regression vs the legacy
Sidebar's behaviour, it can be removed. Suggested cooling period: one minor
release on stable users.
