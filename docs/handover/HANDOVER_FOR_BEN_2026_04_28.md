# Handover — Ben — 2026-04-28

> Catch-up doc for Ben after the late-April UX overhaul push. Adam, Cowork Claude (chat agent), and CC (Claude Code, terminal agent) have been pushing UX09–UX22 + cleanup over a few days. This doc tells you what shipped, what's flaky, what's deferred, and what's worth picking up next.

---

## TL;DR

- **UX01–UX21 + UX08b + UX22 + UX22 cleanup**: shipped to `main`. The whole UX overhaul roadmap is closed except UX13 (list pages re-skin, partial — see below).
- **Migrations 058 + 059**: live; 058 relaxes `rider_folders` RLS, 059 adds the missing UPDATE/DELETE policies on `advance_templates` (default-deny was silently no-op'ing the custom-section delete).
- **Branches**: `main` is canonical. The fix branches (`fix/migration-renumber`, `test/partner-sync-…`, `claude/nostalgic-khorana-144dcb`) are stale; safe to delete after a once-over.
- **Your last canonical-entity work (UX09–UX12) is intact** and now wrapped by the rest of the UX overhaul (PageShell, EntityChip, slide-overs, etc.). Nothing was reverted.
- **Where the bodies are buried**: edit-view advance still has some pre-UX22 ergonomics (see "Known gotchas"); UX13 sweep is half-done; SpreadsheetGrid for advance schedule fields was deferred during UX22 cleanup P3.3 (TODO marker in `AdvanceSectionBuilder.tsx`).

---

## What shipped since you last touched main

### Foundation (UX01–UX08)

- **UX01**: Token catalogue extended (`docs/design-tokens.md`, `src/app/globals.css`). All component code now references `var(--lp-…)` — hex literals only allowed for brand-orange alpha (`#FF45001a`) or via `color-mix(...)`. JS string-concat of CSS vars is banned (broke at runtime).
- **UX02**: Shell components — `<TopBar>`, `<LeftRail>`, `<PageShell>`. Five archetypes: `list | spreadsheet | dashboard | document | builder`.
- **UX03**: `<SlideOver>` primitive at `src/components/shell/SlideOver.tsx`. Used everywhere except the four entity slide-overs (Flight/Person/Room/Gear) which still roll their own backdrop — flagged for UX13 sweep, see below.
- **UX04**: Every authenticated page wrapped in `<PageShell>`. Legacy Sidebar retired to `src/components/_legacy/sidebar/`. Don't import from `_legacy/`.
- **UX05**: `<DataTable>` primitive (`docs/components/DATA_TABLE_CONTRACT.md`). Replaces all custom `<table>` HTML in pages.
- **UX06**: `<SpreadsheetGrid>` (`docs/components/SPREADSHEET_GRID_CONTRACT.md`). Used for Budget, Payroll, Channel List.
- **UX07**: `<TimelineDashboard>` + `<DocumentCanvas>`. The `prose` mode of DocumentCanvas hard-caps content at 720px — important context for any future doc-shaped page.
- **UX08**: `<EntityChip kind={...} id={...} />` for inline entity references. Click opens the entity's slide-over via `useEntityRouting()`. Five canonical kinds: `person | flight | room | gear | show`.
- **UX08b**: ⌘K Command Palette ("Spotlight for Lowpass"). `src/components/command-palette/`, search providers in `src/lib/search/`.

### Canonical entities (UX09–UX12 — your area)

Your work shipped intact, just renumbered:

- **UX09 — Flight**: migration `049_flight_canonical.sql`, types in `src/lib/types/flights.ts`, API in `src/lib/api/flights.ts`. EntityChip kind `flight`.
- **UX10 — Person**: migration `050_person_canonical.sql`. Channel List FK decision documented in `docs/data-model/persons.md` per your earlier note.
- **UX11 — Room**: migration `051_room_canonical.sql`. Hotel/rooming rewire.
- **UX12 — Gear (with ownership)**: migration `052_gear_canonical.sql`. Derived budget sync.

Your migrations originally numbered 033/034/035 — comprehensive renumber to 049/050/051/052 happened on `fix/migration-renumber` after a numbering collision with another contributor's work. Hygiene note added to `database/migrations/README.md`. Two real collisions in the last cycle — read the README before adding any migration.

### Later UX (UX13–UX22)

- **UX13 — List pages re-skin**: PARTIAL. Some list pages re-skinned; eight list clients still on the stub adapter (the `<DataTable>` real-component port is incomplete). Search for `// TODO(UX13)` markers. The four entity slide-overs (Flight/Person/Room/Gear) still roll their own backdrop instead of using `<SlideOver>` — also UX13 territory.
- **UX14 — Budget rebuild**: shipped on `<SpreadsheetGrid>`.
- **UX15 — Payroll, Channel List, Routing**: Payroll + Channel List rewired onto `<SpreadsheetGrid>`. Routing deferred (the `<SpreadsheetGrid>` API needs an extension before Routing fits cleanly — flagged but not started).
- **UX16 — Dashboard rebuild**: tour overview onto `<TimelineDashboard>`. `/dashboard` redirects to the single active tour when there's exactly one.
- **UX17 — Advance + Document pages**: advance read view + pack editor onto `<DocumentCanvas>`. Public share view restored.
- **UX18 — PWA shell**: manifest + service worker + install prompt.
- **UX19 — Mobile receipt capture**.
- **UX20 — Mobile document read**.
- **UX21 — Rental inventory ↔ Gear canonical reconciliation**: schema link migration `057_rental_gear_link.sql`, GearSlideOver rental-link section, `/equipment` "Add to tour".

### UX22 — Advance system overhaul

Five-phase polish pass on the advance system. Shipped:

- **Phase 1**: `/advance` overview redesign — DataTable show list with day-type colour strips, status pills, progress bars, ⋯ menu. AdvanceFlightsPanel + Suggested-layouts grid + right-side aside removed.
- **Phase 2**: Sticky `<AdvanceShowContextBar>` on per-show pages (`src/components/advance/AdvanceShowContextBar.tsx`). Artist · Tour · Day-type · Date · Venue · City breadcrumb with progress chip.
- **Phase 3**: Read view section card polish + scroll-spy anchors (`advance-{slug}` ids, scroll-mt-32, status tokens). Read view only — edit view originally untouched, completed in cleanup pass below.
- **Phase 4**: Apply-template flow → `<SlideOver>` (`ApplyAdvanceTemplateSlideOver.tsx`). Old rolled-own ApplyTemplateModal retired.
- **Phase 5**: Empty-section "copy from previous show" CTA + bulk-status SlideOver (`BulkStatusUpdateSlideOver.tsx`).

### UX22 cleanup pass

After UX22 shipped, the audit found Phase 3 only polished the read view. The edit view was wrapped in `<DocumentCanvas mode="prose">` (720px cap) with a two-column-inside-two-column layout — visibly broken. Cleanup pass fixed it:

- **P1**: Edit view now bypasses DocumentCanvas — full PageShell width. Duplicate Header retired (data lives in ContextBar). Floating "Sections" `<aside>` replaced by LeftRail `docSections` variant using the Phase 3 anchor ids.
- **P2**: Optional `surface={true}` prop on `<DocumentCanvas>` — wraps prose in an `lp-surface` card. Advance read view opts in. Other consumers (deal memos, rider packs, public share) keep the unsurfaced render. Print stylesheet kills the surface.
- **P3**: Edit-mode field-level polish — status hex → `--color-lp-status-*` tokens, person/room/flight/gear pickers → `<EntityChip>`. **`SpreadsheetGrid` for schedule fields was DEFERRED** — `// TODO(UX22-cleanup-P3.3)` marker in `AdvanceSectionBuilder.tsx`. Schedule field's column shape didn't fit a static SpreadsheetGrid config; needs its own pass.
- **P4**: Overview archetype document → list (per UX22 prompt §1.6). ContextBar negative-margin coupling removed. `DayOffNotesModal` converted to `<SlideOver>`.

---

## Migrations

Current highest on `main`: **059**. Two recent additions you'll want to know about:

- **058 — `rider_folders_relax_admin_gate.sql`**: dropped the `is_workspace_admin()` gate from `rider_folders` INSERT and UPDATE. Reason: `is_workspace_admin()` checks `profiles.role_id → roles.is_god`, but `profiles.role_id` is NULL for most users, so even Adam (workspace owner) couldn't create artist-scope rider folders. Workspace membership is now the gate. DELETE remains admin-gated.
- **059 — `advance_templates_update_delete_policies.sql`**: added `at_update` and `at_delete` RLS policies on `advance_templates`. Migration `001` enabled RLS, `011` added SELECT and INSERT policies, but UPDATE and DELETE were never added — default-deny meant every UPDATE/DELETE silently affected 0 rows, Supabase happily reported "success", the API returned 204, and the client's optimistic state update got reverted by the next `fetchTemplates()` call. Took three failed fix attempts before the bug was traced to the policy gap.

**Both lessons worth internalising**: (1) when a Supabase write looks like it succeeded but the row's still there, suspect a missing RLS policy first. (2) The role/admin gating infrastructure (`profiles.role_id → roles.is_god`) is unreliable in this app — assume workspace-membership-only gates unless you have a specific reason to gate on admin.

If you're adding a migration: read `database/migrations/README.md` first. Pick the next sequential number after the highest on `main` AND across active branches. Mirror the number in the file's header comment.

---

## Branches

`main` is canonical. Everything in this handover is on it.

Stale branches that can be deleted after a once-over:

- `fix/migration-renumber` — already merged into main; renumber commits live there.
- `test/partner-sync-20260420-165518` — was the integration branch for UX09–UX12; merged.
- `claude/nostalgic-khorana-144dcb` — Cowork Claude's recovery work branch; merged.
- `claude/thirsty-swartz` (March) — old, unrelated.
- `ux01-tokens-foundation` — old foundation branch; merged.
- `backup/latest-push-3869965` — keep until next stable cut; safety net.
- `export-on-partner-sync` — check with Adam before deleting.

Don't delete branches you didn't make without checking with Adam first.

---

## Known gotchas

1. **Migration number collisions** are real and have happened twice. Always check `main` AND active feature branches before numbering. `database/migrations/README.md` is the authoritative protocol.

2. **Hex+alpha string concatenation of CSS vars doesn't resolve at runtime.** `'var(--lp-orange)' + '1a'` → broken. Use literal hex+alpha (`#FF45001a`) or `color-mix(in srgb, var(--lp-orange) 10%, transparent)`.

3. **Glob patterns choke on `(app)` parens.** Use individual paths or grep, not brace globs.

4. **Build via `next build --webpack` only.** Turbopack hangs on the user's Drive filesystem (network mount). CI uses webpack.

5. **`createServerSupabaseClient` uses the user session and respects RLS.** `createServiceSupabaseClient` bypasses RLS — use only for token-based public access (calendar feed, public share view).

6. **Entity slide-overs (Flight/Person/Room/Gear)** still roll their own backdrop/aside chrome instead of using `<SlideOver>`. Flagged with `// TODO(UX13)`. Don't add a fifth — convert all four when UX13's sweep finishes.

7. **`AdvanceSectionBuilder.tsx` is 5,361 lines** and was the focus of UX22 cleanup P3. Status colours, EntityChips, and tail polish are done; schedule fields → SpreadsheetGrid is the deferred item (`// TODO(UX22-cleanup-P3.3)`).

8. **Don't query canonical entity tables directly from UI.** Go through `getEntityDescriptor(kind).fetchById()` / `.search()` from `src/lib/entities/`. Adding a sixth entity kind means: registry descriptor, `EntityKind` union, slide-over (using the `<SlideOver>` primitive — not your own backdrop).

9. **`useArtistTourContext()`** still exists from the legacy Sidebar era. The TopBar's grouped Tours dropdown now sets `selectedArtistId` when a tour is picked — preserves artist→tour scope across navigation. If you add a new entry point that selects a tour, make sure it sets the artist context too.

10. **DocumentCanvas's `prose` mode is 720px** — fine for read-shaped content (advance read, deal memos, rider packs). Edit-shaped surfaces should bypass DocumentCanvas (see UX22 cleanup P1) or use a wider container.

---

## Open / suggested next priorities

In rough impact order:

1. **Finish UX13 — list pages re-skin** (currently in_progress).
   - Eight list clients still on the stub `<DataTable>` adapter — port to the real `<DataTable>` from `@/components/data-table/DataTable`. Grep `// TODO(UX13)`.
   - Convert the four entity slide-overs (Flight/Person/Room/Gear) from rolled-own backdrop to `<SlideOver>` primitive. Each has a `// TODO(UX13)` marker.

2. **UX22 cleanup P3.3 follow-up** — `<SpreadsheetGrid>` for advance schedule fields. The schedule field type's column shape (time / activity / notes with multi-row + per-row metadata) didn't fit a static SpreadsheetGrid config. Likely needs either a column-config extension on `<SpreadsheetGrid>` or a dedicated `<ScheduleGrid>` variant. Read `docs/components/SPREADSHEET_GRID_CONTRACT.md` before designing.

3. **UX15 Routing** — deferred when UX15 shipped. Same shape: needs a `<SpreadsheetGrid>` extension or a dedicated routing variant.

4. **Decide on the role/admin gating story.** `is_workspace_admin()` returning FALSE for everyone (because `profiles.role_id` is NULL) is a real bug, not a one-off. Two paths: (a) wire up the role linkage properly (migration to backfill role_ids + UI to assign roles) or (b) deprecate the function and use workspace-membership-only checks everywhere. Currently mixed — Migration 058 dropped the check on `rider_folders`, but other tables still gate on it (rider_folders DELETE still does, plus probably others). A workspace audit + decision is overdue.

5. **Mobile parity** (UX19/UX20 shipped, but the mobile experience could use a polish pass — Adam hasn't asked yet but it's the natural next surface).

---

## People / context

- **Adam** — owner. Tour manager building Lowpass for his own use first. Autistic, prefers logical/code-first responses, asks for clarification rather than guessed implementations. He'll catch a wrong assumption before you do.
- **Cowork Claude** — me, the chat agent in Adam's desktop Cowork app. I write prompts, do audits, edit docs, occasionally push small fixes. I don't do long sustained coding sessions.
- **CC (Claude Code)** — the terminal agent that does the big coding sweeps. Lives in Adam's iTerm. CC reads prompts (like the ones in `docs/cursor-prompts/` and `docs/handover/`) and ships commits.
- **You (Ben)** — the canonical-entity / data-layer specialist. Your work has been the foundation other UX work builds on.

The handoff pattern that's been working: Adam describes a problem → Cowork Claude writes a tightly-scoped prompt → CC executes → Adam smoke-tests → fixes loop back via a fix-sprint doc in `docs/handover/`. When you pick up work, fitting into this pattern (or proposing a different one explicitly) is appreciated.

---

## When you're back

Suggested first move: pull `main`, run `npm run lint && npm run typecheck`, scan `// TODO(UX13)` and `// TODO(UX22-cleanup-P3.3)`, and ping Adam with which of the open items you want to take. He'll have opinions.
