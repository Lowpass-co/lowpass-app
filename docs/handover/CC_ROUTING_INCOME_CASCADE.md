# Routing save destroys budget income (+ rider folders) — id-preserving save, then autosave

> **This is the most dangerous live bug in the app.** Saving a tour's routing deletes all of that tour's budget income and show-scoped rider folders. It is live on `main` today, independent of any autosave. Verified end-to-end:
>
> - `POST /api/tours/[id]/routing` (`route.ts:102-105` then `:162-165`) does **delete-all-by-tour then insert fresh rows with new UUIDs** — not an upsert, despite the header comment.
> - `budget_income.routing_id` is `NOT NULL REFERENCES routing(id) ON DELETE CASCADE`, `UNIQUE(routing_id)` (`017_024_combined_budget_system.sql:41,58`). So deleting the routing rows **cascade-deletes every income row for the tour**, and the route never re-links.
> - `rider_folders.routing_id` is **also** `ON DELETE CASCADE` (`039_rider_folders.sql:22`) → show-scoped rider folders die too. Likely other `routing(id)` children as well.
>
> The autosave work (data-integrity Phase R) was correctly **stopped** because debounced bulk-save would fire this destruction on every edit. **Fix the cascade first (Part 1), then layer autosave on top (Part 2).**

---

## 0. Required reading
1. `CLAUDE.md` — migration numbering (next free ≥ highest across main + branches; verify), RLS helpers, "map both sides of the bridge / stop and report".
2. `src/app/api/tours/[id]/routing/route.ts` — the POST (delete-all-reinsert) + any single-row `[routingId]` PATCH that already exists.
3. `src/components/routing/RoutingEditor.tsx`, `RoutingGrid.tsx` — the client. **Note: `RoutingRow` is keyed by date and carries no server `id`** — that's why per-row save needs ids threaded through.
4. `database/migrations/017_024_combined_budget_system.sql` — `budget_income` (FK + UNIQUE(routing_id)).
5. `src/app/api/budget/income/route.ts` (+ `settlement`) — how income is keyed/written (by `routing_id`).
6. `useRealtimeRows` / `hasUserEditedRef` in the routing client — realtime echo guard.

## 1. Hard rules
1. No new deps. No `any`/`@ts-ignore`. Tokens via `var(--lp-…)`. Lint clean, `tsc` zero, build `next build --webpack`.
2. **Money + data safety is the whole point.** No routing write may cascade-delete a child of a row that still exists after the save. A genuinely-removed date SHOULD cascade its children (correct); an edited/kept date MUST retain its `routing.id`.
3. Migration (if any): next free ≥ highest across branches (**note 230/231/232 are used; 233 is the salary-dedupe in the data-integrity branch — verify before picking**). Idempotent, down-block.
4. Commit order: **D (discovery) → 1 (id-preserving save) → 2 (autosave) → V**.

---

## D — Discovery (read-only; brief, Adam reviews)
Write findings into the done report:
- **Enumerate every FK that references `routing(id)`** (grep migrations for `REFERENCES routing(id)` / `REFERENCES public.routing`). List each child table + its ON DELETE rule. This is the true blast radius of the current delete-all. (Known: `budget_income` CASCADE, `rider_folders` CASCADE — find the rest.)
- **Routing identity for reconcile:** is there a `UNIQUE(tour_id, date)` on `routing`? Can two rows share a date (double-show / split day)? If dates aren't unique, keying the reconcile by date is unsafe — report it, we thread real ids instead.
- **How income re-attaches:** after routing changes, is income ever re-seeded (one budget_income per routing date, created lazily)? Confirm whether entered guarantee/actuals are recoverable after a wipe (they are not — but confirm the seed path so Part 1 preserves rather than recreates-empty).

## Part 1 — id-preserving routing save (STOP the cascade)
Convert `POST /api/tours/[id]/routing` from delete-all-reinsert to an **id-preserving reconcile**:
- **Match** incoming rows to existing rows (by `id` if the client threads it — preferred — else by `date` if `UNIQUE(tour_id,date)` holds per discovery).
- **UPDATE** matched rows in place (preserves `routing.id` → income + rider folders survive).
- **INSERT** genuinely-new dates.
- **DELETE** only rows that are actually gone from the payload (their children cascade — correct, the show was removed).
- Keep the canonical-venue/Place-ID resolution (`resolveCanonicalVenues`) and the `sequence`/audit-log behaviour.
- Thread `routing.id` back through the grid so the client sends ids on save (needed here and for Part 2).

**Part 1 acceptance (the money test):**
- [ ] Enter budget income on a tour → edit a routing venue/date and save → **income is still there**. (Today it's wiped.)
- [ ] Same for a show-scoped rider folder.
- [ ] Delete a routing date → its income/folders cascade away (correct); other dates' income untouched.
- [ ] Add a date → new row, existing rows' ids and children unchanged.

## Part 2 — per-row autosave (now safe)
On top of the id-preserving save:
- Debounced **per-row `PATCH /api/tours/[id]/routing/[routingId]`** on cell edit (endpoint exists — verify); per-row `DELETE` on row delete (add a workspace-gated endpoint if missing); single-row insert on add.
- **Fix the "Open advance" hard-nav** (`RoutingGrid.tsx:330` `window.location.assign`) so it flushes/pers ists before navigating.
- Don't let autosave writes trigger a `useRealtimeRows` refetch that clobbers an in-flight edit (`hasUserEditedRef`).
- Surface save state ("Saved ✓") — no silent writes.

**Part 2 acceptance:**
- [ ] Edit a routing cell → refresh → persisted, no manual Save, **income intact**.
- [ ] Delete a day → refresh → stays deleted.
- [ ] Edit routing → Open Advance from the row menu → edit saved.

## V — Verify
- [ ] `tsc`/lint/`next build --webpack` clean.
- [ ] The Part-1 money test passes (income + rider folders survive a routing save) — this is the release gate.
- [ ] Smoke IDs under `docs/smoke-tests/`: ROUTE-01 (income survives routing edit), ROUTE-02 (removed date cascades correctly), ROUTE-03 (autosave persists), plus unblock the data-integrity INT-01/INT-02 that were BLOCKED on this.

## When done
```
Routing save no longer destroys income. Commits D → 1 → 2 → V.
- Blast radius (D): routing(id) children = <list + ON DELETE rules>.
- Part 1: POST routing is now an id-preserving reconcile (UPDATE kept / INSERT new /
  DELETE removed). budget_income + rider_folders survive an edit-save. Files: <list>.
- Part 2: per-row PATCH/DELETE autosave + Open-advance nav flush; ids threaded through grid.
- Smoke ROUTE-01..03; INT-01/02 now unblocked.
- Adam: <migration N if added>; walk ROUTE-01..03 + INT-01/02.
```
If discovery shows routing dates aren't unique (double-shows) OR income has a re-seed path that complicates preservation, STOP and report before writing Part 1 — a wrong reconcile key re-introduces the wipe by another route.
