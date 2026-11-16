# Permissions — design (Nov 2026, for Adam's approval)

Built on the audit (`PERMISSIONS_AUDIT_2026_11.md`). **Built Nov 2026 — see "As built" at the end.**

## What it has to do (Adam, 16 Nov 2026)

- Beta testers each own a workspace; nothing they do reaches another workspace.
- People you invite see **only the tours they're on**, and within a tour only
  the **areas** you allow, at **view or edit** — e.g. a production assistant
  who can edit Receipts but isn't an admin.
- Busy-elsewhere is private: nothing about a person's other bookings leaves
  the workspace that holds them.
- Crew on a phone: parking, advance info, production docs / files (mobile
  view comes after this; it sits beside Daysheets, not instead of it).

## The model

Proven shape for this kind of app: a **workspace role** for coarse access plus
**roles scoped to a resource** — here, the tour. (WorkOS / Clerk / Auth0 all
land on this hybrid; it avoids one-role-per-tour "role explosion".)

**1. Workspace role** (unchanged names)
- **Admin** — everything, incl. members, settings, billing, AI limits.
- **Manager** — everything on every tour; no members / workspace settings.
- **Member** (today's "readonly") — only what tour access gives them.

**2. Tour access** — for Members only, one row per person per tour (or "all
tours"): a **preset**, with per-area overrides.

| Area | Covers |
|---|---|
| Advance | advance answers, packs, venue asks, crew calls |
| Production | riders, channel list, stage plot, gear for the tour |
| Parking | parking maps, driver links |
| Logistics | crew list, hotels & rooming, travel |
| Files | tour Files (and files linked from elsewhere) |
| Schedule | dates & routing, venues on the tour |
| Budget | budget lines, sections, versions |
| Receipts | receipts and their files (separate, so receipts can be done without seeing the budget) |
| Payroll | payroll, rate cards |
| Income | deals, income, settlements, commissions |

Levels: **none · view · edit**. Edit = change that area's data on that tour;
never members, settings or other tours.

Presets (editable later): **Crew** (Schedule, Advance, Production, Parking,
Files: view) · **Production** (those: edit; Logistics: view) · **Accounts**
(Budget + Receipts + Payroll + Income: edit) · **Tour manager** (everything: edit).
The production assistant = Production + Receipts: edit.

**3. Always your own** — whatever the areas say, a member sees their own
crew record, flights, room and pay lines (via their login ↔ crew link).

**4. Personal data** — passport, date of birth, emergency contact move to a
separate table: admin/manager + the person themselves. Rates stay Payroll.

**Linking a login to a crew record.** The database already has the column
(`personnel.user_id`) but nothing fills it. **Invite codes** fill it: you add
the person to People, generate a code, they sign up with it → their account
joins your workspace as a Member, linked to that person, with the tour access
you chose. Same flow as Daysheets. Public sign-up off.

## How it is enforced — one check, everywhere

- **Database (the real gate).** One table `tour_access` (member, tour or all,
  area, level). Helper functions in a **private schema** the browser can't
  call: `tours_i_can(area, level)` returns the tour ids. Every tour table's
  rule becomes `tour_id IN (SELECT private.tours_i_can('advance','view'))` —
  computed **once per query**, not per row (Supabase's documented 100× case).
  Separate rules for read and for insert / update / delete (USING + WITH CHECK).
- **Tables with no `tour_id`** (advance answers, income, settlements reach the
  tour via the show day; budget notes, rider rows via a parent) get a
  `tour_id` column kept in step by trigger, so every rule is the same simple,
  indexed check — no joins inside rules.
- **Artist-level things** (artist riders, artist files): admin / manager only —
  members see tour items only (Adam, 16 Nov).
- **File storage**: the path `{workspace}/{tour|artist}/{id}/…` is checked by
  the same function — the file and its row can never disagree.
- **Server routes** that use the service key call the same check explicitly
  (a test lists them and fails if one doesn't).
- **App**: one call returns "my access on this tour" (area → level); the menu,
  pages and edit buttons all read it. No second copy of the rules in code.
- **Cross-links**: AI index chunks carry tour + area and are filtered; search,
  Overview, linked files, share links, parking drawings all ask the same check.

**Pitfalls designed out** (from the audit + Supabase guidance):
- Old catch-all rules OR'd past new ones (the 264 bug) → every table's
  policies are replaced as a set, and a probe asserts no other rule remains.
- Helper functions callable from the browser → private schema.
- Rules on unindexed columns → index every `tour_id` they read.
- Permissions in the login token go stale for an hour → kept in the table.
- Per-row joins in rules → denormalised `tour_id` + set lookup.
- Code and database disagreeing → the app reads the database's answer.

## Rollout — safe on a hand-pasted live database

Today the only live user is you (admin) — admins and managers lose nothing,
so this is the cheapest it will ever be to do.

1. **Beta blockers** (independent, small): crew-clash check own-workspace
   only; profile can't be pointed at a workspace you're not in; AI cap
   ceiling; site-admin list guarded; `advance-files` private; shared-venue
   edits site-admin only.
2. **Foundation**: areas, presets, `tour_access`, private helpers, "my
   access" call, invite codes + login↔crew link. **Shadow report**: a
   read-only query showing, per member, what they'd see under the new rules
   vs now — checked before any rule changes.
3. **Database enforcement, area by area** (Schedule → Advance → Production →
   Parking → Logistics → Files + storage → Budget / Payroll / Income), each
   with a "member with access sees it, member without doesn't" test, and a
   probe after each paste.
4. **App**: pages, menu, edit buttons, service-key routes, cross-links,
   personal-data split.
5. **Members screen**: invite with tours + preset; per-person access grid.
6. **Crew mobile**: parking, advance info, production docs / files.

Every migration idempotent, assert-before-drop (as 264), with a down block.

## Decisions (Adam, 16 Nov 2026)

- Tour access: **explicit** — tours + preset chosen per person.
- Areas: the nine above with **Receipts split from Budget** (ten).
- Artist library: **tour items only** for members.
- Shared venues during the beta: **site admin edits only**.

## Questions as asked

1. **Tour access: explicit or automatic?** Recommended **explicit** — you
   choose tours + preset when inviting. Automatic ("on the crew list = can
   see the tour") is convenient but means adding someone to a crew list
   silently grants them data.
2. **Areas + presets** above — right list?
3. **Artist library for members**: see the artist's riders / files for
   artists whose tours they're on (recommended), or tour items only?
4. **Shared venues during the beta**: site-admin edits only (recommended).

## As built (16 Nov 2026)

| Step | What | Where |
|---|---|---|
| 1 | Beta blockers | migration 291 (pasted) |
| 2 | Foundation: `tour_access`, `private.*` helpers, `my_tour_access`, invites carry crew record + access, `beta_codes`, page grants copied | 292 + `_REPORT_292_shadow_access.sql` |
| 3 | The database enforces it: 88 tables + tour-files / rider-assets storage | 293, GENERATED from `scripts/permissions/rules.mjs` by `gen293.mjs`; emergency undo `_DOWN_293_workspace_rules.sql` |
| 4 | App reads it: rail + page gate (`ia.ts` `area`, AppShellV3 `<NoAccess>`), `requireWrite({ area, tourId })` | `src/lib/permissions/tourAccess.ts` |
| 5 | Team & roles: invite with crew record + tours + preset; per-member access; Admin › Beta codes; code-only sign-up (`/auth/beta-signup`) | `src/components/settings/members/TourAccessEditor.tsx` |
| 6 | Crew phone view: `/crew` → tour → show day (advance info, parking, files). Members land there. | `src/app/(app)/crew/`, `src/server/crew/load.ts` |

**Changed from the plan above:**
- **No denormalised `tour_id` columns.** Tables that reach the tour through a parent use set helpers instead (`days_i_can`, `packs_i_can`, `lines_i_can`, `settlements_i_can`) — same once-per-query cost, no new columns, no triggers to keep in step, no backfill on the live database.
- **No personal-data table split.** `personnel` (the master record with passport / DOB / emergency) is now admin/manager + the person themselves; members read names and contacts from `persons` (the mirror) for crew on tours they can see. Same outcome, no data move.
- **AI index (`rag_chunks`)**: admin/manager only for now (closes audit B3) rather than per-area chunk filtering. Members don't get "Ask" until chunks carry tour + area.
- **Tour settings** (Details, Dates & routing, Money) are managers-only in the app; a Member with Schedule edit can't reach Dates & routing yet.

**Member-editable routes (step 4) — the rest stay admin/manager-only (fail closed):**
Receipts (create / edit / delete / upload / file against a line), Parking (save, PDF record, driver links, drawing read), Advance (answers, sections, packs, venue ask). NOT yet: Files writes, Production (riders / channel list / stage plot / gear), Logistics, Schedule, Budget, Payroll, Income — a Member with edit there can edit in the database but the app's buttons will be refused by the route. Convert a route by passing `{ area, tourId }` to `requireWrite` once its side effects (derived budget lines!) are checked.
