# Permissions — design (Nov 2026, for Adam's approval)

Built on the audit (`PERMISSIONS_AUDIT_2026_11.md`). Nothing here is built yet.

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
| Budget | budget lines, receipts, sections, versions |
| Payroll | payroll, rate cards |
| Income | deals, income, settlements, commissions |

Levels: **none · view · edit**. Edit = change that area's data on that tour;
never members, settings or other tours.

Presets (editable later): **Crew** (Schedule, Advance, Production, Parking,
Files: view) · **Production** (those: edit; Logistics: view) · **Accounts**
(Budget + Payroll + Income: edit) · **Tour manager** (everything: edit).
The production assistant = Production + Budget: edit.

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
- **Artist-level things** (artist riders, artist files): visible to members
  who can see a tour of that artist, for that area.
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

## Decisions for Adam

1. **Tour access: explicit or automatic?** Recommended **explicit** — you
   choose tours + preset when inviting. Automatic ("on the crew list = can
   see the tour") is convenient but means adding someone to a crew list
   silently grants them data.
2. **Areas + presets** above — right list?
3. **Artist library for members**: see the artist's riders / files for
   artists whose tours they're on (recommended), or tour items only?
4. **Shared venues during the beta**: site-admin edits only (recommended).
