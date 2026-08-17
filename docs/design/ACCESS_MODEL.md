# Lowpass — the access model

Design, 2026-08-14. Replaces five coexisting authorization axes with one. Adam's rulings are recorded inline and must not be silently reversed.

---

## 1. What we're replacing

Five things currently decide what you can see, and they disagree with each other:

| # | Axis | Where it lives | What it actually governs |
|---|---|---|---|
| 1 | `workspace_members.role` — admin/manager/readonly | RLS + `requireWrite` | Most writes. The real gate today. |
| 2 | `permission_grants` — page/product × read/write | `can_access()` | 10 tables, and **only consulted for readonly members** |
| 3 | `tour_roles.role` — 7 values | app layer only | The Day sheet, and nothing else |
| 4 | `profiles.is_site_admin` | `requireSiteAdmin` | Anthropic-side admin tools |
| 5 | `roles.is_god` (legacy) | one surviving caller | Whether commissions are stripped from a payroll response |

Measured against the live database, not the migration files:

```
304 policy clauses on 98 tables   tenancy only — no role check at all
 40 clauses on 38 tables          is_workspace_admin (33 are a single DELETE)
 36 clauses on 10 tables          can_access
 27 clauses on 17 tables          self-scoped / site-admin / deny-all
```

**69% of the database encodes "are you in this workspace" and nothing more.** `artists`, `tours`, `routing`, `personnel`, `rider_packs`, `venues`, `gear` — every core entity is read-and-write-open to any member.

Three known breaks in what does exist:

- **`can_access` is nullified on eight of ten money tables** — migration 017's `*_workspace` policies survived and RLS is permissive, so the gate never ran. Migration 264 closes this.
- **`tour_roles.user_id` is never written**, and `resolveViewerTourRole` looks the viewer up by it. The tour-role model cannot identify a signed-in user at all.
- **`requireWrite` ignores grants.** All 203 call sites use the bare form, so it resolves to `role IN ('admin','manager')`. A readonly member with an explicit write grant is refused by the API while RLS would admit them.

## 2. The model

Three axes. Every access question is answered by the same three.

```
        WHERE                    WHAT                      HOW MUCH
        scope                    area                      level
   ┌──────────────┐       ┌────────────────┐         ┌──────────────┐
   │ workspace:id │       │ budget.*       │         │ none         │
   │ tour:id      │   ×   │ operations.*   │    →    │ read         │
   │ (artist:id)  │       │ production.*   │         │ write        │
   └──────────────┘       │ workspace.*    │         └──────────────┘
                          └────────────────┘
```

- **Scope** — where access applies. A membership row per (person, scope).
- **Area** — what they can reach. The resource catalogue, extended to cover the app.
- **Level** — `none` / `read` / `write`. `none` is explicit so an override can *subtract*.

A **role** is a named preset: a mapping of areas to levels. "Crew" is not a thing the system understands — it's a label for a set of (area, level) pairs. That's what makes Adam's tooltip requirement answerable: the tooltip renders the bundle.

**Adam's ruling — scope:** tour now, artist later. The grant tables are keyed `(scope_type, scope_id)` rather than carrying a `tour_id` column, so an artist axis drops in without rewriting a single policy. Artist scoping matters the day one workspace serves clients who mustn't see each other; we're not paying for it now, only leaving the door open.

**Adam's ruling — bundles:** code presets, DB overrides. The seven presets are defined in `slices.ts` and **seeded into a table by a generated migration** so RLS can read them. Code stays the source of truth; a test regenerates and diffs to catch drift. A workspace can override per person; it cannot redefine a preset.

## 3. Schema

```sql
access_memberships
  id, workspace_id, user_id,
  scope_type   text CHECK (scope_type IN ('workspace','tour','artist')),
  scope_id     uuid NOT NULL,        -- = workspace_id for workspace scope,
                                     -- so UNIQUE works (NULLs are distinct in PG)
  role         text NOT NULL,        -- preset name
  created_by, created_at
  UNIQUE (user_id, scope_type, scope_id)

access_overrides
  id, workspace_id, membership_id → access_memberships(id) ON DELETE CASCADE,
  area  text NOT NULL,
  level text CHECK (level IN ('none','read','write')),
  UNIQUE (membership_id, area)

access_role_presets                  -- GENERATED from slices.ts, never hand-edited
  role text, area text, level text,
  PRIMARY KEY (role, area)
```

Resolution, in order: **override wins → else preset → else `none`.** Fail closed.

`is_workspace_owner` and `is_site_admin` stay as they are — they're not areas, they're identity.

## 4. The helpers

Three `SECURITY DEFINER STABLE` functions beside `get_my_workspace_id()`, so Postgres caches per statement and policies never inline a join. This codebase has `004_fix_rls_recursion.sql` for a reason.

```sql
access_level(p_area text, p_scope_type text, p_scope_id uuid) → 'none'|'read'|'write'
can_read (p_area text, p_scope_type text, p_scope_id uuid)    → boolean
can_write(p_area text, p_scope_type text, p_scope_id uuid)    → boolean
```

Two shapes at the call site, because tables come in two shapes:

```sql
-- tour-scoped table (has tour_id)
USING (workspace_id = get_my_workspace_id() AND can_read('budget.line_items','tour', tour_id))

-- workspace-scoped table (no tour_id: artists, persons, venues, gear…)
USING (workspace_id = get_my_workspace_id() AND can_read('workspace.personnel','workspace', workspace_id))
```

**Tour scope inherits workspace scope.** Someone with a workspace-level membership granting `budget.*` gets it on every tour without 40 rows. `access_level` checks the narrower scope first, then falls back to the wider one, and takes the **higher** of the two — a tour membership can widen access, never narrow it. Narrowing is what `override level='none'` is for, and it applies at the scope it's attached to.

## 5. Cutover — the part that decides whether this ships

304 policy clauses cannot be rewritten in one paste and verified by inspection. So the design makes the cutover **behaviour-preserving by construction**:

```sql
ALTER TABLE workspaces ADD COLUMN access_model_enabled boolean NOT NULL DEFAULT false;
```

While the flag is false, `access_level()` returns `write` for any workspace member — **exactly today's behaviour**. So every policy can be converted, pasted and deployed with zero observable change. Flip the flag per workspace when the model is populated and verified. Flip it back instantly if something's wrong.

That gives us the one property this project has repeatedly lacked: a large change that can be landed and reverted without a migration.

Admins bypass everything, always, at the top of `access_level`. An admin locked out of their own workspace by a misconfigured preset is the failure mode that turns a bad release into a support incident.

## 6. Areas

The current `RESOURCE_CATALOG` has 21 entries against ~60 route surfaces and 113 RLS-bearing tables. Whole products are missing: gear/equipment, the Day, labor calls, venues, the workspace personnel pool, flights, the entire `/m/*` mobile surface, artist library sub-pages, settings.

Areas are hierarchical by dotted prefix, and a grant on a prefix implies its children — `budget` implies `budget.line_items`. That keeps presets short and readable, and it's what makes "Crew sees Production, not Money" expressible in one row rather than fifteen.

Extending the catalogue to cover the app is its own task and it is **not** optional groundwork — an area that doesn't exist can't be granted or denied, so every gap is a permanent hole in the model.

## 7. The app layer

RLS is the enforcement; the API must agree with it or the two layers disagree in ways that are invisible until someone hits the seam — which is exactly today's `requireWrite` bug.

- `requireWrite(supabase)` keeps working unchanged — role check, current behaviour.
- `requireWrite(supabase, { area, scope })` is the converted form.
- Routes convert incrementally. **The ratchet already enumerates all 194 mutating routes**; extend it to also assert that a converted route names an area, so conversion can't half-happen.
- Derive `tourId` from route params where present, so most conversions are a one-line addition rather than a rewrite.

## 8. What this retires

- `can_access()` → replaced by `can_read`/`can_write`. Its 36 clauses convert first; they're the only ones currently doing the intended thing.
- `is_workspace_admin()` → survives only where admin genuinely means admin: membership, permissions, billing, workspace settings. The 33 single-DELETE clauses become area checks.
- `tour_roles` → **becomes `access_memberships` with `scope_type='tour'`.** Same idea, given database authority and a working user link. `sliceFor()` keeps governing which Day *blocks* load, because that's a rendering concern and it works.
- `roles.is_god` / `profiles.role_id` → deleted, after the one commission-stripping caller moves to an area check.
- `budget_approver_grants` → an area (`budget.approve`), since today it evaluates to "is admin" anyway.

## 9. Phasing

Each phase is independently landable and independently revertible.

| Phase | What | Risk |
|---|---|---|
| **1** | Tables, helpers, preset seed, the flag. Additive. | None — nothing reads it yet |
| **2** | Backfill memberships for existing people; the Personnel *Access* control; role descriptions | None — flag still off |
| **3** | Convert the 10 money tables. Flip the flag in a test workspace. | Contained, reversible |
| **4** | Convert the remaining ~290 clauses in groups | Mechanical once 3 proves out |
| **5** | `requireWrite` area-aware; ratchet extended | App layer catches up |
| **6** | Retire the five old axes | Cleanup |

**Phase 3 is the real test.** If the money tables behave correctly with the flag on for one workspace, the pattern is proven and phase 4 is repetition. If they don't, we've learned it on ten tables instead of three hundred.

## 10. Open questions

1. **The seven role descriptions.** Adam writes these; they are the product. Everything else here is plumbing.
2. **What does a workspace member with no tour membership see?** My proposal: the workspace-scope preset only — their profile, and whatever libraries their areas allow. Not tours they're not on. Needs confirming, because it's the answer to "what does a new invitee land on".
3. **Do managers keep blanket write?** P0-D, still open. Under this model the honest answer is that "manager" becomes a preset like any other, and the question dissolves into what that preset contains.
4. **Where do the 8 token mechanisms fit?** They grant object access to people with no account. They should stay separate — but `tour_role_links` already carries a role, so tokenized access should resolve *through* this model rather than beside it.
