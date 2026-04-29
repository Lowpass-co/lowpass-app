# Handover — Ben — 2026-04-29

> Supersedes `HANDOVER_FOR_BEN_2026_04_28.md`. The role/admin gating mess flagged in yesterday's doc is now resolved — migration 060 landed last night and you have a workspace Admin role waiting for you. The rest of the codebase state below reflects everything on `main` as of this evening.

---

## TL;DR

- **UX01–UX21 + UX08b + UX22 + UX22 cleanup**: shipped to `main`. UX13 (list pages re-skin) is the only roadmap item still partial.
- **Roles infrastructure wired** (overnight): migration 060 backfilled `profiles.role_id` so `is_workspace_admin()` actually works. You and Adam are Admin. New signups default to Member. UI to promote/demote at `/settings/team`.
- **Migrations 058 + 059 + 060 live.** 058 = relaxed `rider_folders` admin gate. 059 = added missing UPDATE/DELETE policies on `advance_templates`. 060 = roles backfill + Team UI infrastructure.
- **Branches**: `main` is canonical. Stale fix branches can be deleted after a once-over.
- **Your canonical-entity work (UX09–UX12) is intact**, renumbered to 049/050/051/052 — no reverts.
- **Where the bodies are buried**: UX13 sweep is half-done; UX22 cleanup deferred SpreadsheetGrid for advance schedule fields (`// TODO(UX22-cleanup-P3.3)`); UX15 Routing was deferred when UX15 shipped.

---

## What's changed since yesterday's handover

If you read the 04-28 doc already, only this section is new:

1. **Migration 060 (`060_roles_wiring.sql`)** — applied last night. For every workspace, ensures Admin (`is_god = true`) + Member (`is_god = false`) roles exist. Backfilled every profile with `role_id IS NULL` to Admin. Updated the auto-provisioning trigger from `002_auto_provisioning.sql` so new signups default to Member, not Admin. Added RLS on `roles` table (members SELECT, admins write) and extended `profiles` UPDATE so admins can change other members' role_id within their workspace.

2. **`/settings/team` page** — new. Lists workspace members on a `<DataTable>` with role pills (Admin = brand-orange tint, Member = muted) and an actions menu gated on caller-is-admin. PATCH `/api/workspace/members/[id]/role` does the role swap, with a last-admin self-demote guard. Settings left-rail extended with the Team entry.

3. **Adam's policy decision (FYI)**: only Adam and Ben should be Admin going forward. Anyone we onboard into a workspace defaults to Member; explicit promotion via the Team page is required to grant admin abilities. If you find a test user / abandoned signup is currently Admin (because of the backfill), demote them via `/settings/team`.

4. **The advance template delete bug** — fixed via 059 four days back; mentioning it because it's been a recurring pain point. The takeaway lesson is in the gotchas section: **a Supabase write that "succeeds" but doesn't change the row almost always means a missing RLS policy.** Default-deny silently no-ops.

---

## State of the codebase (full picture)

### Foundation (UX01–UX08)

- **UX01**: Token catalogue (`docs/design-tokens.md`, `src/app/globals.css`). All component code references `var(--lp-…)`. Hex literals only allowed for brand-orange alpha (`#FF45001a`) or via `color-mix(...)`. JS string-concat of CSS vars is banned (broke at runtime — historical bug).
- **UX02**: Shell components — `<TopBar>`, `<LeftRail>`, `<PageShell>`. Five archetypes: `list | spreadsheet | dashboard | document | builder`.
- **UX03**: `<SlideOver>` primitive (`src/components/shell/SlideOver.tsx`). Used everywhere except the four entity slide-overs (Flight/Person/Room/Gear) which still roll their own backdrop — flagged for UX13 sweep.
- **UX04**: Every authenticated page wrapped in `<PageShell>`. Legacy Sidebar retired to `src/components/_legacy/sidebar/`. Don't import from `_legacy/`.
- **UX05**: `<DataTable>` primitive (`docs/components/DATA_TABLE_CONTRACT.md`). Replaces all custom `<table>` HTML.
- **UX06**: `<SpreadsheetGrid>` (`docs/components/SPREADSHEET_GRID_CONTRACT.md`). Used for Budget, Payroll, Channel List.
- **UX07**: `<TimelineDashboard>` + `<DocumentCanvas>`. The `prose` mode of DocumentCanvas hard-caps content at 720px — important context for any future doc-shaped page.
- **UX08**: `<EntityChip kind={...} id={...} />` for inline entity references. Click opens the entity's slide-over via `useEntityRouting()`. Five canonical kinds: `person | flight | room | gear | show`.
- **UX08b**: ⌘K Command Palette. `src/components/command-palette/`, search providers in `src/lib/search/`.

### Canonical entities (UX09–UX12 — your area)

Your work shipped intact:

- **UX09 — Flight**: migration `049_flight_canonical.sql`. EntityChip kind `flight`.
- **UX10 — Person**: migration `050_person_canonical.sql`. Channel List FK decision documented in `docs/data-model/persons.md`.
- **UX11 — Room**: migration `051_room_canonical.sql`. Hotel/rooming rewire.
- **UX12 — Gear (with ownership)**: migration `052_gear_canonical.sql`. Derived budget sync.

Original numbering (033/034/035) was renumbered to 049/050/051/052 after a collision. Hygiene note in `database/migrations/README.md`. Two real collisions in the last cycle — read the README before adding any migration.

### Later UX (UX13–UX22)

- **UX13 — List pages re-skin**: PARTIAL. Eight list clients still on the stub adapter; grep `// TODO(UX13)`. The four entity slide-overs still roll their own backdrop instead of using `<SlideOver>` — also UX13 territory.
- **UX14 — Budget rebuild**: shipped on `<SpreadsheetGrid>`.
- **UX15 — Payroll, Channel List, Routing**: Payroll + Channel List rewired onto `<SpreadsheetGrid>`. Routing deferred — `<SpreadsheetGrid>` API needs an extension.
- **UX16 — Dashboard rebuild**: tour overview onto `<TimelineDashboard>`. `/dashboard` redirects to the single active tour when there's exactly one.
- **UX17 — Advance + Document pages**: advance read view + pack editor onto `<DocumentCanvas>`. Public share view restored.
- **UX18 — PWA shell**: manifest + service worker + install prompt.
- **UX19 — Mobile receipt capture**.
- **UX20 — Mobile document read**.
- **UX21 — Rental inventory ↔ Gear canonical reconciliation**: schema link migration `057_rental_gear_link.sql`.

### UX22 — Advance system overhaul

- **Phase 1**: `/advance` overview redesign — DataTable show list with day-type colour strips, status pills, progress bars, ⋯ menu. AdvanceFlightsPanel + Suggested-layouts grid + right-side aside removed.
- **Phase 2**: Sticky `<AdvanceShowContextBar>` on per-show pages. Artist · Tour · Day-type · Date · Venue · City breadcrumb with progress chip.
- **Phase 3**: Read view section card polish + scroll-spy anchors (`advance-{slug}` ids, scroll-mt-32, status tokens).
- **Phase 4**: Apply-template flow → `<SlideOver>` (`ApplyAdvanceTemplateSlideOver.tsx`).
- **Phase 5**: Empty-section "copy from previous show" CTA + bulk-status SlideOver.

### UX22 cleanup

The audit caught Phase 3 as half-done — read view polished, edit view never touched. Cleanup pass shipped:

- **P1**: Edit view bypasses DocumentCanvas (full PageShell width). Duplicate Header retired (data lives in ContextBar). Floating "Sections" `<aside>` replaced by LeftRail `docSections` variant using the Phase 3 anchor ids.
- **P2**: Optional `surface={true}` prop on `<DocumentCanvas>` — wraps prose in an `lp-surface` card. Advance read view opts in.
- **P3**: Edit-mode field-level polish — status tokens, EntityChip swap-in for person/room/flight/gear pickers. **`SpreadsheetGrid` for schedule fields was DEFERRED** — `// TODO(UX22-cleanup-P3.3)` marker in `AdvanceSectionBuilder.tsx`. Schedule field's column shape didn't fit a static SpreadsheetGrid config.
- **P4**: Overview archetype document → list. ContextBar negative-margin coupling removed. `DayOffNotesModal` converted to `<SlideOver>`.

---

## Migrations

Current highest on `main`: **060**. Recent additions:

- **058 — `rider_folders_relax_admin_gate.sql`**: dropped `is_workspace_admin()` from `rider_folders` INSERT and UPDATE because the function returned FALSE for everyone (since `profiles.role_id` was NULL). DELETE remained admin-gated.
- **059 — `advance_templates_update_delete_policies.sql`**: added the never-existed `at_update` and `at_delete` RLS policies on `advance_templates`. RLS was enabled in 001, SELECT + INSERT were added in 011, UPDATE and DELETE were missed entirely. Default-deny silently no-op'd every advance-template write — three failed fix attempts before tracing it to the policy gap.
- **060 — `roles_wiring.sql`**: backfilled every `profiles.role_id IS NULL` to the workspace's Admin role (so `is_workspace_admin()` finally returns TRUE for existing users). Seeded Admin + Member roles per workspace. Updated auto-provisioning trigger so new signups default to Member. Added RLS on `roles` table.

Now that `is_workspace_admin()` actually works, migration 058's relaxation on rider_folders is technically reversible — workspace admins could legitimately be required for artist-scope rider writes again. Adam decided to leave 058 as-is for now. If you want to re-tighten, that's a separate migration discussion.

If you're adding a migration: read `database/migrations/README.md` first. Pick the next sequential number after the highest on `main` AND across active branches.

---

## Branches

`main` is canonical. Everything in this handover is on it.

Stale branches that can be deleted after a once-over:

- `fix/migration-renumber` — merged.
- `test/partner-sync-20260420-165518` — merged.
- `claude/nostalgic-khorana-144dcb` — Cowork Claude's recovery branch; merged.
- `claude/thirsty-swartz` (March) — old, unrelated.
- `ux01-tokens-foundation` — merged.
- `backup/latest-push-3869965` — keep until next stable cut.
- `export-on-partner-sync` — check with Adam first.

Don't delete branches you didn't make without checking with Adam.

---

## Known gotchas

1. **Migration number collisions** are real and have happened twice. Always check `main` AND active feature branches before numbering.

2. **Hex+alpha string concatenation of CSS vars doesn't resolve at runtime.** `'var(--lp-orange)' + '1a'` → broken. Use literal hex+alpha (`#FF45001a`) or `color-mix(in srgb, var(--lp-orange) 10%, transparent)`.

3. **Glob patterns choke on `(app)` parens.** Use individual paths or grep, not brace globs.

4. **Build via `next build --webpack` only.** Turbopack hangs on the user's Drive filesystem.

5. **`createServerSupabaseClient` uses the user session and respects RLS.** `createServiceSupabaseClient` bypasses RLS — use only for token-based public access (calendar feed, public share view).

6. **A Supabase write that "succeeds" but didn't change the row almost always means a missing RLS policy.** Default-deny silently no-ops. Check the table has a policy for the operation you're attempting before debugging anywhere else. (Lesson from the advance_templates 059 bug.)

7. **`is_workspace_admin()` works again** as of 060 — but it returns TRUE only for users whose `role_id` points to a role with `is_god = true`. If you're testing with a Member user, expect admin-gated operations to fail (correctly).

8. **Entity slide-overs (Flight/Person/Room/Gear)** still roll their own backdrop/aside chrome instead of using `<SlideOver>`. Flagged with `// TODO(UX13)`. Don't add a fifth — convert all four when UX13's sweep finishes.

9. **`AdvanceSectionBuilder.tsx` is 5,361 lines** and was the focus of UX22 cleanup P3. Status colours, EntityChips, and tail polish are done; schedule fields → SpreadsheetGrid is the deferred item (`// TODO(UX22-cleanup-P3.3)`).

10. **Don't query canonical entity tables directly from UI.** Go through `getEntityDescriptor(kind).fetchById()` / `.search()` from `src/lib/entities/`. Adding a sixth entity kind means: registry descriptor, `EntityKind` union, slide-over (using `<SlideOver>` — not your own backdrop).

11. **`useArtistTourContext()`** still exists from the legacy Sidebar era. The TopBar's grouped Tours dropdown sets `selectedArtistId` when a tour is picked — preserves artist→tour scope across navigation. If you add a new entry point that selects a tour, make sure it sets the artist context too.

12. **DocumentCanvas's `prose` mode is 720px** — fine for read-shaped content (advance read, deal memos, rider packs). Edit-shaped surfaces should bypass DocumentCanvas (see UX22 cleanup P1) or use a wider container.

---

## Open / suggested next priorities

In rough impact order:

1. **Finish UX13 — list pages re-skin** (currently in_progress).
   - Eight list clients still on the stub `<DataTable>` adapter — port to the real `<DataTable>` from `@/components/data-table/DataTable`. Grep `// TODO(UX13)`.
   - Convert the four entity slide-overs (Flight/Person/Room/Gear) from rolled-own backdrop to `<SlideOver>` primitive. Each has a `// TODO(UX13)` marker.

2. **UX22 cleanup P3.3 follow-up** — `<SpreadsheetGrid>` for advance schedule fields. The schedule field type's column shape (time / activity / notes with multi-row + per-row metadata) didn't fit a static SpreadsheetGrid config. Likely needs either a column-config extension on `<SpreadsheetGrid>` or a dedicated `<ScheduleGrid>` variant. Read `docs/components/SPREADSHEET_GRID_CONTRACT.md` before designing.

3. **UX15 Routing** — deferred when UX15 shipped. Same shape as #2: needs a `<SpreadsheetGrid>` extension or dedicated routing variant.

4. **Roles permissions JSONB** — migration 060 only wired `is_god`. The `roles.permissions` JSONB column is still empty. If demoting someone to Member ends up too coarse-grained ("they lost X ability they should have kept"), this is the next pass: granular permission keys, RLS reads from JSONB. Don't pre-build it; surface specific complaints first.

5. **Mobile parity polish** (UX19/UX20 shipped, but the mobile experience could use a polish pass — Adam hasn't asked yet but it's the natural next surface).

---

## People / context

- **Adam** — owner. Tour manager building Lowpass for his own use first. Autistic, prefers logical/code-first responses, asks for clarification rather than guessed implementations.
- **Cowork Claude** — chat agent in Adam's desktop Cowork app. Writes prompts, does audits, edits docs, occasionally pushes small fixes. Doesn't do long sustained coding sessions.
- **CC (Claude Code)** — the terminal agent that does the big coding sweeps. Reads prompts (in `docs/cursor-prompts/` and `docs/handover/`) and ships commits.
- **You (Ben)** — canonical-entity / data-layer specialist. Your work is the foundation other UX work builds on.

The handoff pattern: Adam describes a problem → Cowork Claude writes a tightly-scoped prompt → CC executes → Adam smoke-tests → fixes loop back via a fix-sprint doc in `docs/handover/`. When you pick up work, fitting into this pattern (or proposing a different one explicitly) is appreciated.

---

## When you're back

Suggested first move: pull `main`, run `npm run lint && npm run typecheck`, scan `// TODO(UX13)` and `// TODO(UX22-cleanup-P3.3)`, visit `/settings/team` to confirm your Admin role, and ping Adam with which open item you want to take. He'll have opinions.
