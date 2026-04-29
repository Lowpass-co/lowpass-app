# Nav Redesign — Fix-up Pass

> Quick follow-up after the seven-commit nav redesign sprint (PR #3 on `feat/nav-redesign-artist-tour-hubs`). Audit caught one real bug (channel-list Setup chip is a proxy that lies) and one hygiene gap (per-page TourBreadcrumb mount is now a required pattern but not documented). Single commit. ~30 minutes.

---

## 0. Required reading

1. `CLAUDE.md`
2. `docs/handover/CC_NAV_ARTIST_TOUR_WORK.md` — the original nav prompt
3. `src/server/tours/getTourHubData.ts` (or wherever setup status is resolved — check the Phase C commit `2dc3b29`)
4. `database/migrations/040_channel_list.sql` — confirms `channel_list_rows` table exists
5. The Phase D commit `e347a5f` — the per-page TourBreadcrumb mount pattern that worked around PageShell's scroll structure

---

## 1. Hard rules

1. No new dependencies.
2. All visual values via `var(--lp-…)` tokens.
3. No `any`, no `// @ts-ignore`.
4. Lint clean (75/121 baseline). Typecheck zero errors.
5. Build via `next build --webpack` only.
6. **Single commit.** This is a small fix, don't fragment it.

---

## P. Setup chip truth audit + breadcrumb hygiene note (~30 min)

### P.1 The channel-list bug

Phase C's `getTourHubData()` (or equivalent) currently treats the Channel list Setup chip as TRUE when any `rider_packs` row exists for the tour. That's a proxy and it lies — riders and channel lists are different things. A tour with riders but no channel list shows ✓ when it shouldn't; a tour with a channel list but no riders shows — when it shouldn't.

Replace with a real existence check:

```ts
const { data: channelRow } = await supabase
  .from('channel_list_rows')
  .select('id')
  .eq('tour_id', tourId)
  .limit(1)
  .maybeSingle();
const channelListSetup = channelRow !== null;
```

`channel_list_rows` is indexed on `tour_id` (verify in `migrations/040_channel_list.sql` — and add an index if missing, but only as a separate migration, not inside this commit). The query is cheap — one indexed row read.

Drop the `// proxy` comment that was there. Replace with no comment (the code now matches what the chip claims).

### P.2 Audit the OTHER Setup chips

While you're in `getTourHubData()`, verify each chip is querying its actual truth source, not a proxy. Expected truth sources:

| Chip | Truth source | Cheap query |
|---|---|---|
| Routing | `routing` table | `SELECT id FROM routing WHERE tour_id = X LIMIT 1` |
| Channel list | `channel_list_rows` | (the fix above) |
| Personnel | tour-personnel link table — likely `tour_personnel` or `personnel` with a tour FK; check the schema | `SELECT id FROM <table> WHERE tour_id = X LIMIT 1` |
| Rooming | `rooming` table | `SELECT id FROM rooming WHERE tour_id = X LIMIT 1` |
| Riders linked | count of `rider_pack_tour_links` (or however riders are linked to tours — check the rider system schema) | `SELECT count(*) FROM <link table> WHERE tour_id = X` |

For each chip: read the existing implementation, confirm it's hitting the right table. If any other chip is also using a proxy, fix it the same way (real existence check). Add a brief inline comment naming the source table per chip — future agents shouldn't have to spelunk to figure out which table backs which chip.

If a chip's actual truth source is genuinely heavy to query (e.g. requires joining four tables), that's a flag — surface it explicitly in the commit message and Adam will decide whether the chip's worth the cost or should be removed. Don't silently re-introduce proxies.

### P.3 Breadcrumb hygiene note

Phase D mounted `<TourBreadcrumbServer>` on each tour-internal page individually because PageShell's scroll structure (`<main overflow:auto>`) means a layout-level mount sits outside the scroll context and breaks sticky positioning. That decision is correct, but it means **every new page added under `src/app/(app)/tours/[id]/**`** must remember to mount `<TourBreadcrumbServer tourId={tourId} pageName="..." />` at the top of its content tree. There's currently no enforcement — easy to forget.

Two things to add:

1. **CLAUDE.md note.** In the "Critical conventions" section, add a bullet:
   > **Tour-internal pages require `<TourBreadcrumbServer>`.** Every page under `src/app/(app)/tours/[id]/**` must mount `<TourBreadcrumbServer tourId={...} pageName="..." />` at the top of its content tree. The mount cannot live in `tours/[id]/layout.tsx` because PageShell's scroll structure puts the layout outside the sticky scroll context. See the Phase D commit `e347a5f` for the pattern.

2. **`<TourBreadcrumbServer>` JSDoc.** Add a top-of-file comment in `src/components/tours/TourBreadcrumbServer.tsx` (or wherever the component lives — find the file):
   ```ts
   /**
    * Mount this at the TOP of every page under src/app/(app)/tours/[id]/**.
    *
    * Why per-page and not in tours/[id]/layout.tsx:
    * PageShell creates a <main overflow:auto> scroll container. A sticky
    * element mounted in the layout sits OUTSIDE that scroll context and
    * fights the TopBar's stacking. Mounted per-page (inside main), sticky
    * top:0 works as intended.
    *
    * If you're adding a new tour-internal page and forgot to mount this,
    * the user loses the [Back to tour] escape hatch. Don't.
    */
   ```

### P.4 Acceptance

- [ ] Channel list Setup chip queries `channel_list_rows` directly, not a proxy
- [ ] Every other Setup chip queries its actual truth source (no proxies remain)
- [ ] Inline comment per chip names the source table
- [ ] CLAUDE.md has a "Tour-internal pages require `<TourBreadcrumbServer>`" bullet in Critical conventions
- [ ] `<TourBreadcrumbServer>` has a top-of-file JSDoc explaining why per-page mount and what breaks if you forget it
- [ ] Lint + typecheck clean, build via `next build --webpack` succeeds
- [ ] Smoke test: pick a tour with riders but NO channel list — Channel list chip shows — (gray); pick a tour with a channel list but no riders — Channel list chip shows ✓ (green)

### P.5 Commit

```
fix(tour-hub): replace channel-list Setup chip proxy with real check + truth-source audit

Channel list chip was treating any rider_packs row as a positive
signal. Riders and channel lists are different concepts; the proxy
lies in both directions. Replaced with an existence check against
channel_list_rows (cheap indexed read).

Audited the other Setup chips while there: each now queries its
actual truth source with an inline comment naming the table.
[If any other chip changed: list it here. If not, say "no other
proxies found".]

Added a CLAUDE.md note that <TourBreadcrumbServer> must be mounted
per-page on every tour-internal page (cannot live in layout because
PageShell's scroll structure breaks sticky positioning) plus a
JSDoc on the component file explaining why and what breaks if
forgotten — Phase D's per-page mount pattern is now documented as
a required convention.

Made-with: Claude Code (nav redesign fix-up)
```

---

## When done

```
Nav redesign fix-up done.
Commit: <sha>.
- Channel list Setup chip queries channel_list_rows directly.
- Other Setup chips audited; [list any changes or "no other proxies"].
- CLAUDE.md + TourBreadcrumbServer JSDoc document the per-page
  mount requirement.
- Lint + typecheck clean. Built via next build --webpack.
```

If any Setup chip turned out to be genuinely expensive to compute properly, surface that in the report — Adam will decide whether to keep, remove, or accept a documented proxy.
