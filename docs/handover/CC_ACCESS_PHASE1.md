# CC — Access model, phase 1: the foundation. Additive only. Nothing changes behaviour.

Design doc: `docs/design/ACCESS_MODEL.md`. Read it before this file.

This bank builds the model and **wires it to nothing**. No existing policy is touched, no route changes, no UI. When you're done, the app behaves exactly as it does today and a `SELECT` against three new tables tells you what the new system *would* say. That is the whole point — 304 policy clauses get converted in phase 4, and they only get converted once the resolver is provably correct in isolation.

**Topology first.** Confirm every file:line and every count cited here before planning. This doc was written from a read of the tree plus live `pg_policy` probes, not from running the app.

---

## Adam's rulings — recorded. Do not reverse these silently.

Seven presets. Three scopes.

| Scope | Preset | Intent |
|---|---|---|
| workspace | **Owner** | Everything, including other members' personal data, plus billing |
| workspace | **Admin** | Everything operational plus membership. **Not** billing, not AI spend |
| artist | **Artist Manager** | Artist-level admin. **Inherits down to every tour of that artist** |
| tour | **Tour Manager** | Tour-level admin |
| tour | **Production** | Operations and advance. No money |
| tour | **Accountant** | Money and settlement |
| tour | **Band + Crew** | Day view only. Nothing derived from money or ops |
| tour | **Driver** | Schedule, venue, hotels, flights |

- **Artist scope is phase 1, not deferred.** Adam reversed the earlier "tour only" ruling when he specified Artist Manager. The schema was already keyed `(scope_type, scope_id)` for exactly this, so it costs a scope value and an inheritance rule — not a rewrite.
- **Artist Manager absorbs the old Management role.** They were the same thing.
- **Band and Crew are merged for now.** Splitting them again is a phase-N audience-tagging feature; nothing here should make that harder.
- **Agent: dropped.** Do not add it.
- **No membership without a role** — `role` is `NOT NULL` and there is no code path that creates a membership row without one.

---

## A-1 — The area catalogue. Do this first and STOP for Adam's sign-off.

Everything else references areas, so a wrong vocabulary here is expensive later. The current `RESOURCE_CATALOG` (`src/lib/permissions/resources.ts`) has **21 entries** against roughly **60 route surfaces** and **113 RLS-bearing tables**. Whole products have no area at all: gear/equipment/rental, the Day, labor calls, venues, the workspace personnel pool, flights, the entire `/m/*` mobile surface, artist library sub-pages, budget sub-surfaces (settlement, income, reports), and settings.

**An area that doesn't exist cannot be granted or denied.** Every gap is a permanent hole.

- Areas are **hierarchical by dotted prefix**, and a grant on a prefix implies its children: `budget` implies `budget.line_items`. This is what keeps presets to a handful of rows instead of sixty.
- Enumerate from **two** sources and reconcile them: every `page.tsx` under `src/app`, and every RLS-bearing table. A surface with no area, or a table no area covers, is a gap — list both explicitly.
- Keep the existing 21 ids where they still fit. **Renaming an existing id silently orphans its `permission_grants` rows**, so if you rename one, say so and include the migration that moves the grants.
- Reuse the current shape: `{ id, label, description, sensitive }` (`resources.ts:29-36`).
- 8 entries are currently dead config — 4 referenced nowhere at all. `operations.personnel.compensation` is the worst: migration `079:38-46` documents an API redaction keyed on it that **was never built**. Either wire it in a later phase or drop the entry; don't leave it looking implemented.

**Deliverable: the proposed catalogue as a table, for Adam to approve before A-2.** This is the vocabulary of the whole system and it is the one part he'll be reading for years.

## A-2 — Schema

Number after re-checking every branch immediately before committing — two agents number into this space and 256–263 landed while 255 was in flight. Highest applied is 264.

```sql
access_memberships
  id, workspace_id, user_id,
  scope_type text CHECK (scope_type IN ('workspace','artist','tour')),
  scope_id   uuid NOT NULL,      -- = workspace_id when scope_type='workspace'
  role       text NOT NULL,      -- Adam's ruling: never nullable
  created_by, created_at
  UNIQUE (user_id, scope_type, scope_id)

access_overrides
  id, workspace_id,
  membership_id uuid → access_memberships(id) ON DELETE CASCADE,
  area  text NOT NULL,
  level text CHECK (level IN ('none','read','write')),
  UNIQUE (membership_id, area)

access_role_presets              -- GENERATED from code. Never hand-edited.
  role text, area text, level text,
  PRIMARY KEY (role, area)
```

`scope_id` is `NOT NULL` and set to `workspace_id` for workspace scope **because Postgres treats NULLs as distinct** — a nullable `scope_id` makes the UNIQUE constraint useless and lets one person hold ten workspace memberships.

**RLS on these three tables — and this is the recursion trap.** `access_memberships` policies must **not** call `can_read()`, because `can_read()` reads `access_memberships`. Use plain workspace scoping plus `is_workspace_admin()`, exactly as `permission_grants` does today (`078:274-280`). This repo has `004_fix_rls_recursion.sql` because someone already learned this.

Add `workspaces.access_model_enabled boolean NOT NULL DEFAULT false`.

## A-3 — The presets, generated from code

`slices.ts` stays the source of truth; SQL needs them in a table. So: presets are defined in TypeScript, and a **generated** migration seeds `access_role_presets` from them.

- Write the preset matrix in `src/lib/access/presets.ts` as `Record<PresetName, Record<AreaId, Level>>`.
- A script emits the seed SQL. A unit test regenerates and diffs against the committed migration, so drift fails the suite rather than rotting.
- Seed is `ON CONFLICT (role, area) DO UPDATE` so a re-paste converges rather than erroring.
- Presets reference areas from A-1. **A preset naming an area that doesn't exist must fail the test**, not seed a dead row.

Sketch, to be corrected against the approved catalogue — money is expressed by *absence*, not by an explicit `none`:

```
Owner            *: write, billing: write, personal_data: read
Admin            *: write, membership: write        (no billing, no ai_spend)
Artist Manager   *: write within artist scope
Tour Manager     *: write within tour scope
Production       operations: write, advance: write, production: write
Accountant       budget: write, settlement: write, day: read
Band + Crew      day: read
Driver           day: read  (+ an override or a narrower area — see below)
```

**Driver needs a decision from you, not a guess.** Adam wants Driver to see schedule, venue, hotels and flights but not contacts — which is finer than `day` as a whole. Either the Day splits into sub-areas (`day.schedule`, `day.contacts`, …) or Driver carries a built-in override. **Propose one and argue it**; sub-areas are more honest but multiply the catalogue.

## A-4 — The resolver

Three `SECURITY DEFINER` `STABLE` functions with `SET search_path = public`, beside `get_my_workspace_id()`:

```sql
access_level(p_area text, p_scope_type text, p_scope_id uuid) → 'none'|'read'|'write'
can_read (p_area text, p_scope_type text, p_scope_id uuid)    → boolean
can_write(p_area text, p_scope_type text, p_scope_id uuid)    → boolean
```

Resolution order, and each step matters:

1. **Not a member of the workspace → `none`.** Fail closed, always, before anything else.
2. **Workspace Owner or Admin → `write`.** Bypass at the top. An admin locked out of their own workspace by a bad preset is how this becomes a support incident.
3. **`access_model_enabled = false` → `write` for any member.** This is today's behaviour exactly, and it is what makes phases 3 and 4 safe.
4. Otherwise resolve: collect every membership covering this scope — the scope itself, plus the artist above a tour, plus the workspace — and for each take **override if present, else preset, else none**. Return the **highest** level found.
5. **Area prefixes:** a grant on `budget` satisfies a query for `budget.line_items`. Match longest-prefix-first so a specific override beats a general grant.

**Scope inheritance:** tour ⊂ artist ⊂ workspace. A membership at a wider scope applies to everything inside it — that's what makes Artist Manager work when a new tour appears. Wider scope can only **widen**; narrowing is what an override at the narrower scope is for.

Resolving the artist above a tour means reading `tours.artist_id`. Do it inside the `SECURITY DEFINER` function, never inline in a policy.

## A-5 — Tests, and this is the deliverable that matters

Nothing is wired up in this phase, so the resolver's correctness cannot be observed by using the app. **The test suite is the only evidence this bank produces.** Treat it that way.

- A table-driven suite over the resolver: every preset × a representative area from each product × each scope, asserted against the intended matrix. Seven presets is small enough to assert exhaustively — do that rather than sampling.
- **The invariant that guards phase 4:** with `access_model_enabled = false`, `access_level` returns `write` for every member, every area, every scope. Assert it explicitly. If this ever fails, converting policies stops being safe.
- Fail-closed cases: unknown area, unknown role, no membership, membership in another workspace, `scope_id` pointing at a deleted tour.
- Prefix matching: a `budget` grant satisfies `budget.line_items`; a `budget.line_items` override does **not** satisfy `budget.receipts`.
- Inheritance: artist membership grants a tour created *after* the membership.
- **Test the SQL functions, not just a TypeScript port.** The TS `canAccess` and SQL `can_access` have already diverged once in this codebase — `requireWrite` ignores grants entirely while RLS honours them. If a TS mirror is needed for the app layer, generate both from one definition or test them against each other.

---

## Order

A-1 → **stop, Adam approves the catalogue** → A-2 → A-3 → A-4 → A-5.

Do not start A-2 before the catalogue is signed off. Everything downstream references those ids.

## Gates

Floor green · **money harnesses 72 / 27 / 40 untouched** — this bank must not go near them; if one moves, stop and say why · vitest 538 plus the new suite, known RoutingEditor/pdfProbe flake, rerun once · migrations idempotent with down-blocks, delivered as paste-SQL, **wait for Adam to say "pasted"** · no route calls the new helpers yet — if you find yourself editing a `route.ts`, you have left phase 1.

**The acceptance test for this bank is that nothing happens.** Paste the migrations, deploy, and the app is byte-for-byte as it was. Any observable change means something got wired that shouldn't have been.

And the standing one: RLS and resolver behaviour are invisible to `tsc`, `eslint` and unit tests run without a database. Two production outages this fortnight passed all four gates. Prove the resolver against the real database with a real second session before claiming it works.
