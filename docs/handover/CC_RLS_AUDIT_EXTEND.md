# RLS Audit — Extend 061 to Cover Missing Tables

> Smoke testing of `061_rls_audit.sql` exposed a gap: nine tables exist in the live database but were not covered by the audit (CC built the discovery from migration history and missed them). This prompt extends `061_rls_audit.sql` on PR #5's branch to cover those nine, then re-applies. Single commit on the existing branch.

---

## 0. Required reading

1. `CLAUDE.md`
2. `database/migrations/061_rls_audit.sql` — the file you'll be extending
3. `docs/handover/RLS_AUDIT_DISCOVERY_2026_04_29.md` — extend §1 with the new tables
4. `database/migrations/001_initial_schema.sql` (file_references)
5. `database/migrations/017_budget_system.sql` and `017_024_combined_budget_system.sql` (flight_bookings, hotel_bookings, hotel_room_assignments, rooming_grid) — note the duplicated `017_*` filenames; read whichever has the most up-to-date schema for these tables
6. `database/migrations/050_person_canonical.sql` (personnel_tour_assignments — verify; might be elsewhere)
7. `database/migrations/057_rental_gear_link.sql` and any rental-area migrations (rental_inventory, rental_jobs, rental_job_items)

---

## 1. Hard rules

1. No new dependencies.
2. No `any`, no `// @ts-ignore`.
3. Lint clean (75/121 baseline). Typecheck zero errors.
4. **Idempotent.** Every CREATE POLICY preceded by DROP POLICY IF EXISTS. Drop both legacy names (`"Users can …"`) AND modern names (`"<table>_<op>"`) to be safe.
5. Adam's locks (do not relitigate):
   - Workspace membership is the gate on SELECT/INSERT/UPDATE for every routine-edit table.
   - DELETE keeps admin gate ONLY on canonical-entity workspace-wide tables (`flights`, `persons`, `rooms`, `gear`, `deal_memos`, `expenses` — already in 061).
   - **Add `rental_inventory` to the canonical-entity list** — it's workspace-wide gear that gets rented out, same shape as the existing canonicals. DELETE admin gate.
   - Everything else routine — drop admin gates.
6. Single commit, on the existing PR #5 branch.

---

## E. Extend `061_rls_audit.sql` to cover nine missing tables (~1 hr)

### E.1 The nine tables + treatment

| Table | Workspace resolution | Treatment |
|---|---|---|
| `file_references` | direct `workspace_id` (verify in 001) | routine: workspace-only on all 4 ops |
| `flight_bookings` | `tour_id` → `tours.workspace_id` | routine: workspace-via-tour on all 4 ops |
| `hotel_bookings` | `tour_id` → `tours.workspace_id` (verify) | routine: workspace-via-tour on all 4 ops |
| `hotel_room_assignments` | `hotel_booking_id` → `hotel_bookings.tour_id` → `tours.workspace_id` (two-level subquery, or `workspace_id` direct if denormalised — verify) | routine: workspace on all 4 ops |
| `personnel_tour_assignments` | `tour_id` → `tours.workspace_id` (or direct `workspace_id`) | routine: workspace on all 4 ops |
| `rental_inventory` | direct `workspace_id` | **canonical-entity treatment**: workspace-only on S/I/U, **DELETE keeps admin gate** |
| `rental_jobs` | direct `workspace_id` (or `tour_id`) | routine: workspace on all 4 ops |
| `rental_job_items` | `rental_job_id` → `rental_jobs.workspace_id` | routine: workspace on all 4 ops |
| `rooming_grid` | `tour_id` → `tours.workspace_id` (verify) | routine: workspace-via-tour on all 4 ops |

**Verify each table's actual workspace-resolution pattern by reading its `CREATE TABLE` in the originating migration before writing the policy.** Don't guess — if a table has a direct `workspace_id` column, use it; if it joins via a parent, use that pattern. Don't invent a join that doesn't exist.

### E.2 Implementation

Open `database/migrations/061_rls_audit.sql`. Add a new section **§9 Missing-from-prior-audit tables** at the end of the policy declarations, before any final verification block. Each table block follows the same DROP/CREATE pattern as the rest of 061 — see the existing rider_packs or channel_list_rows blocks as the template for routine tables, and the existing flights/persons/rooms blocks as the template for canonical-entity treatment (DELETE admin gate).

For tables resolving via parent FK (e.g. `flight_bookings.tour_id` → `tours.workspace_id`), use the subquery pattern:

```sql
DROP POLICY IF EXISTS "flight_bookings_select" ON public.flight_bookings;
CREATE POLICY "flight_bookings_select"
  ON public.flight_bookings FOR SELECT
  USING (
    tour_id IN (
      SELECT id FROM public.tours
      WHERE workspace_id = public.get_my_workspace_id()
    )
  );
-- ... and so on for INSERT/UPDATE/DELETE with the same subquery
```

Drop legacy policy names too (the original migrations may have used names like `"Users can view tour flights"` or whatever the 017 era pattern was — grep them and add DROP POLICY IF EXISTS for each).

### E.3 Update the discovery report

Open `docs/handover/RLS_AUDIT_DISCOVERY_2026_04_29.md` and append a new section (or extend §1) listing the nine added tables, their workspace-resolution pattern, and the treatment applied. Match the existing table format.

Add a "Followup notes" section at the bottom that records:
- The two tables (`advance_dropdown_options`, `advance_schedule_templates`) were missing from prod entirely; Adam manually pasted CREATE TABLE blocks for them before this extension landed
- The discovery report's §0 SQL queries should be re-run after the extended 061 applies; if any new gaps surface, they're a follow-up sprint (not blocking)

### E.4 Acceptance

- [ ] `061_rls_audit.sql` has explicit policy declarations for all nine new tables
- [ ] Each policy uses the correct workspace-resolution pattern (verified against the originating migration)
- [ ] `rental_inventory` DELETE policy keeps the admin gate (canonical-entity pattern)
- [ ] Other eight tables are workspace-membership-only on all four ops
- [ ] Grep contract still holds: `grep is_workspace_admin database/migrations/061_rls_audit.sql` returns ONLY canonical-entity DELETE policies (now seven: original six plus `rental_inventory`) + `roles_admin_write` + `profiles_admin_update`
- [ ] Discovery report updated
- [ ] Migration runs cleanly twice in a row (idempotent)
- [ ] Lint + typecheck clean

### E.5 Smoke after Adam applies the extended 061

The §B.5 smoke queries in the original audit prompt still apply. Specifically:

```sql
-- Every workspace-scoped table has at least SELECT and INSERT policies
SELECT
  c.relname AS table_name,
  count(*) FILTER (WHERE p.polcmd = 'r'::char) AS select_count,
  count(*) FILTER (WHERE p.polcmd = 'a'::char) AS insert_count,
  count(*) FILTER (WHERE p.polcmd = 'w'::char) AS update_count,
  count(*) FILTER (WHERE p.polcmd = 'd'::char) AS delete_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = TRUE
GROUP BY c.relname
HAVING count(*) FILTER (WHERE p.polcmd = 'r'::char) = 0
    OR count(*) FILTER (WHERE p.polcmd = 'a'::char) = 0
ORDER BY c.relname;
```

Expected: empty result (every workspace-scoped RLS-enabled table has at least SELECT + INSERT). The intentional exceptions (rider_pack_history, rider_pack_exports as append-only; rider_web_links as revoke-pattern) will pass this check because they have S+I; they just lack U/D which is fine.

If any rows return, those are the tables the extension still missed — surface in the report and we'll write another extension.

### E.6 Commit

```
fix(migrations): extend 061_rls_audit to cover nine tables missed in initial audit

Smoke against the live database surfaced nine workspace-scoped tables
that exist in production but weren't covered by 061's first pass:
file_references (001), flight_bookings, hotel_bookings,
hotel_room_assignments, rooming_grid (017), personnel_tour_assignments,
rental_inventory, rental_jobs, rental_job_items.

Each gets the canonical 4-policy shape using its actual
workspace-resolution pattern (direct workspace_id, or transitive via
tour_id / hotel_booking_id / rental_job_id). rental_inventory follows
the canonical-entity treatment (DELETE admin gate retained); the other
eight are routine workspace-membership-only across all four ops.

Discovery report updated with the new tables and a followup-notes
section documenting that advance_dropdown_options +
advance_schedule_templates were missing from prod entirely (Adam
pasted CREATE TABLE blocks manually before this extension).

Idempotent. The grep contract still holds: is_workspace_admin appears
only in canonical-entity DELETE policies + roles_admin_write +
profiles_admin_update.

Adam: re-apply the extended 061 in Supabase SQL editor.

Made-with: Claude Code (RLS audit extension)
```

---

## When done

```
RLS audit extension done.
Commit: <sha>.
- 061_rls_audit.sql now covers 9 additional tables (file_references,
  flight_bookings, hotel_bookings, hotel_room_assignments,
  personnel_tour_assignments, rental_inventory, rental_jobs,
  rental_job_items, rooming_grid).
- rental_inventory added to canonical-entity DELETE-gated list.
- Discovery report updated.
- Adam: re-apply 061 in Supabase, then re-run §B.5 smoke checks.
- Lint + typecheck clean.
```

If any of the nine tables turn out to have a workspace-resolution pattern that doesn't fit cleanly (e.g. a table joins via THREE levels of FKs), surface it in the report — Adam will decide whether to denormalise a `workspace_id` column onto that table or accept the multi-level subquery cost.
