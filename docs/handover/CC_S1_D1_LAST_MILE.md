# CC — S1 D-1 last mile: the documents work, nobody can reach them, and the carnet is 100% incomplete on real data

D-1 shipped and deployed. I verified it against production (`c9affb9`, live) by POSTing both routes from an authenticated session. **Both return real PDFs** — `/api/gear/export/manifest/pdf` → 200 `application/pdf` 139,767 bytes; `/api/gear/export/carnet/pdf` → 200 175,418 bytes; both `%PDF-` magic. The render shell, the loader, the grouping and the allow-list entries are all correct. Credit where it's due: the route-guard entries at `route-guard-coverage.test.tsx:91-93` are exactly the right shape — read-only POST, stated read check, permanent.

What follows is what the runtime says that the repo could not.

---

## D1-L1 — The carnet is unusable today, and it's mostly a column mismatch. Fix this first.

I read all 33 gear rows off `GET /api/gear` on production:

```
total = 33
missing country_of_origin = 2
missing customs_hs_code   = 33     ← every row
missing value_amount      = 33     ← every row
INCOMPLETE (any of the 3) = 33     ← 33 of 33
```

So `analyseCarnetCompleteness` currently reports **"33 of 33 items incomplete"** and the document renders `— MISSING —` in two of seven columns on every single row. The differentiator ships as a page of gaps.

**But the value is not missing — it's in a different column.** Same 33 rows:

```
purchase_cost > 0    = 33     ← every row has a value
value_currency set   = 33     ← every row already has a currency
value_amount         = 0      ← the column the carnet reads
dimensions_cm set    = 33
qr_token set         = 33
weight_kg > 0        = 33
```

Sample row: `{ name: "AKG 414", purchase_cost: 300, value_amount: null, value_currency: "GBP", customs_hs_code: null, country_of_origin: "AU", weight_kg: 0.3 }`.

`value_currency` being populated on a row whose `value_amount` is null is the tell: something writes the currency for a figure that lives in `purchase_cost`. **Nothing in the app has ever written `value_amount`** — confirm that with a grep before you act on it; if a write path does exist, say so and stop, because then this is a data problem and not a code one.

**The fix, if the grep confirms:** the carnet's value column falls back to `purchase_cost` when `value_amount` is null, and `analyseCarnetCompleteness` treats a row with either as complete. Note `gear-data.ts:54-56` — `SELECT` currently pulls `value_amount, value_currency` and **not** `purchase_cost`, so the column has to be added to the select first.

Two things to get right rather than guess:

- **Are they the same quantity?** Customs wants *value for customs purposes* — replacement/market value. `purchase_cost` is what was paid, which for a five-year-old amp is not the same number. A fallback is honest as a default and dishonest as a silent equivalence. My recommendation: fall back, and **label it in the document** ("value from purchase cost") so a broker knows the provenance, with `value_amount` remaining the override that wins when set. If you disagree, argue it — don't just implement it.
- **Do NOT backfill `value_amount` from `purchase_cost` in a migration.** That destroys the distinction permanently and can't be undone once someone edits one of them. Derive at read time.

`customs_hs_code` is genuinely absent on all 33 and no fallback exists — that one is Adam's data entry, and it is exactly what the pre-flight check in D1-L2 is for.

## D1-L2 — Zero UI callers. The routes are unreachable.

Grepping `api/gear/export` across `src/` returns hits only in `.next/` build artefacts and the two route files' own header comments. **No button, no dialog, no fetch, no link.** Both documents are reachable only by hand-crafting a POST, which is how I tested them. Nothing in `src/components` or `src/app/(app)` imports `carnet-completeness` either, so the spec's *"pre-export completeness check listing exactly which items are missing which fields, with a link to fix each"* (`CC_S1_STAGE_D.md` §D-1) **was not built** — the count exists only as a subtitle inside the PDF, which is the one place it is too late to act on.

Build the entry point on the Assets surface:

- An **Export** control offering *Gear manifest* and *ATA carnet general list*, with the scope selector (workspace / space / tour) the loader already supports.
- For carnet, a **pre-flight panel** rendered from `analyseCarnetCompleteness` — the same predicate the document uses, imported, not reimplemented. "N of 33 items incomplete", the per-item gaps, and a link that opens each item's edit surface at the offending field.
- Export stays enabled with gaps (a partial list is still useful for filling in), but the panel is not dismissible-by-default.
- Say in the UI, plainly, that this is **the general list a carnet application requires, not a carnet** — chambers of commerce issue those. Over-claiming here is a real liability, and it is the one line of copy I want you to keep verbatim from the spec.

**The wiring is not free, and this is the part to report on before building.** `ExportTemplateEditor.tsx:158-161` builds its endpoint as `/api/${surface}/${tourId}/export/pdf`. For `surface='gear-manifest'` that yields `/api/gear-manifest/<id>/export/pdf` — which does not exist. The two new routes are `/api/gear/export/<doc>/pdf`: no `tourId` path segment (scope is in the body) and a different shape from every other surface. Its title map (`:504-508`) has no gear or carnet case either.

So there are two options and I want your read before you pick:

1. **Bend the routes to the convention** — but scope here isn't a tourId, it's a three-way union, so the convention doesn't fit without inventing a fake path segment.
2. **Bend the editor** — add an endpoint override for surfaces whose scope isn't a tour. Small change, but `ExportTemplateEditor` is shared by six live surfaces (budget, rooming, routing, day, stage-plot, channel-list) and a regression there is visible everywhere.

Related and probably the real answer to both: `template-config.ts:426` returns **rooming's default config** for `gear-manifest` and `carnet`, and the gear body builders ignore `sections` entirely. So if you wire these into the template editor as-is, the user is shown rooming's section list against a gear document. Either give the two surfaces their own section set, or don't route them through the template editor at all and give them a plain scope-picker dialog. **I lean to the plain dialog** — these documents have no per-section structure to configure, and forcing them through an editor built for something else is how the rooming config ended up standing in for gear in the first place.

## D1-L3 — Tour-scoped exports embed the artist logo at full source resolution

Measured on production, same route, four scopes:

```
workspace  (33 items, no logo)      175,418 bytes
tour A     (0 gear links, artist)   192,162 bytes
tour B     (1 gear link,  artist)   881,231 bytes   ← one item
bogus tour (0 links, no artist)      91,450 bytes
```

A one-item carnet is **881KB**, of which roughly 790KB is the artist image. `gear-data.ts:136-149` resolves `logoUrl` via `resolveArtistLogoUrlSync` and the HTML embeds it at source size; Chrome re-encodes it into the PDF whole. These documents get emailed to brokers and clients.

Cap it — a bounded raster (width and DPI) before embed. **Check whether the other export surfaces that resolve an artist logo share this**; if they do, fix it in the shared shell rather than in the gear loader, and say which surfaces were affected.

Two smaller things in the same code path:

- **Branding is tour-only.** A workspace- or space-scoped manifest has no letterhead at all, because `logoUrl`/`artistName` are resolved inside `if (scope.kind === 'tour')`. A workspace document should still carry workspace branding.
- **These byte figures are NOT evidence about row filtering** and I'm flagging that so nobody cites them as such later. Logo size dominates the total and swamps the ~2.5KB a row costs. I read `gear-data.ts:72-86` instead: tour scope resolves `tour_gear` → ids → `.in('id', ids)`, guarded by `ids.length > 0`. That reads correct, but it is **unverified at runtime** — the whole workspace has exactly **one** `tour_gear` row, so there is no data with which to observe the filter working. If you want a real SPD-03, the tour-scoped manifest test needs fixture links.

## D1-L4 — `readScope` fails open to the whole workspace

`readScope` (both routes, `:31-36`) returns `{kind:'workspace'}` for anything it doesn't recognise. I sent `{kind:'nonsense'}` and got back a document **byte-identical** to the workspace export (175,418 both times). Body parsing is `await request.json().catch(() => ({}))`, so a malformed body does the same.

A typo'd, stale, or future scope kind therefore silently produces *the largest possible document* rather than an error — the entire workspace's gear, when the caller asked for one space. That is the failure class `CLAUDE.md` already names: silent, no exception, no log line, nothing to alert on, and the wrong answer is the plausible-looking one.

Make it explicit: `{kind:'workspace'}` only when the caller says so or omits `scope` entirely. An unrecognised `kind` → 400 with the offending value named.

## D1-L5 — The stored `day_rate` column still holds 1% values

Sample row: `purchase_cost: 300, day_rate: 3`. That's 1% — the pre-change figure. All 33 rows still carry the old number in the column; `day_rate_manual = false` means `effectiveInventoryDayRate()` recomputes 9 at read time, so every path that goes through the helper is correct and this is invisible.

**Any path that reads `gear.day_rate` / `rental_inventory.day_rate` raw is wrong by 3×.** Enumerate them — grep both column names and check each read either goes through `effectiveInventoryDayRate()` or is a write. Report the list with file:line even if it comes back empty; empty is a useful result here and I want it on the record rather than assumed.

The gear export loader is clean (its `SELECT` at `gear-data.ts:54-56` doesn't include `day_rate`). This is about everything else.

---

## Still blocking D-2, asked before and not yet answered

Adam runs this in the Supabase SQL editor, read-only:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'rental_movements'
ORDER BY ordinal_position;
```

D-2 depends entirely on migration 250's `from_space_id / to_space_id / from_container_id / to_container_id`, and **those columns have zero readers anywhere in `src/`** — nothing would break if they were absent, and nothing would tell you. Do not start D-2 on the assumption.

Related, and worth knowing before the scan flow is built: **`space_id` is set on 2 of 33 items and `container_id` on 0 of 33.** So the manifest's space → container grouping is real code rendering 31 items into "Unplaced / Loose items" — correct behaviour, no data. Scanning is what populates this, which is a decent argument for D-2 being the right next slice, but it also means SPD-01's weight roll-ups have no nested structure to roll up through yet. Test it with fixtures, not with production's shape.

## CONCURRENCY — another agent is in the export surfaces right now

Fable is writing updates to **rider packs and the channel list** as you start this. Channel list is one of the six surfaces sharing `ExportTemplateEditor.tsx` and `template-config.ts`, so those two files are contended.

**Do not edit `ExportTemplateEditor.tsx` or `template-config.ts` in this bank.** That removes option 2 in D1-L2 for now — take the standalone scope-picker dialog, which is what I recommended on the merits anyway. If you conclude the editor genuinely must change, stop and say so rather than editing it; Adam will sequence it.

The rest of D1-L1 through D1-L5 is in `src/lib/export/gear-*.ts`, `carnet-completeness.ts`, `gear-data.ts`, the two gear route files and the Assets surface — none of which Fable is touching. Confirm your working tree is clean and name your branch before you start.

## Order

D1-L1 (data correctness — the document is wrong today) → D1-L4 (small, and it's a fail-open) → D1-L2 (standalone dialog, per the concurrency note) → D1-L3 → D1-L5 (audit, may be a no-op). Then D-2 once the probe returns.

## Gates

Floor green · `carnet-completeness` unit tests extended to cover the `purchase_cost` fallback and the "either satisfies" completeness rule · **money harnesses 64/21/15 untouched** — none of this should go near them, and if a harness moves, stop and say why · no migration should be needed for any of the above; if you think one is, argue it before writing it · Vercel deployment confirmed **against your commit hash** before claiming any of it is live.

**Acceptance is a number, not a green build:** after D1-L1, the carnet pre-flight on production reports incomplete rows in the low single digits driven by `customs_hs_code` alone — not 33 of 33.
