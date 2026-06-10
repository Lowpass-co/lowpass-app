# ROUTING_RAIL_MAP — Stage A (map only, no code)

> Shared `<RoutingRail>`: one days-on-the-left rail used on every surface that
> indexes by tour day — Advance, Payroll, Rooming (×3), and later the
> export/daysheet builder. This document maps **what exists today** so Stage B
> builds on real columns and absorbs every existing behaviour. No code written.
>
> **Status:** Stage A. Awaiting Adam's review + the decisions in §5 before any
> Stage B code.

---

## 0. TL;DR

- **No shared rail exists.** Grep for `RoutingRail` / `DayRail` / `WeekRail` /
  `RoutingSidebar` / `NightList` / `DayList` → **zero matches**. Every surface
  rolls its own day indexing.
- The **one canonical source of truth for tour days is the `routing` table**
  (no separate `shows` table). Confirmed columns below.
- Two genuinely rail-shaped implementations exist today:
  1. **Advance** — `AdvanceUpcomingSidebar` (a real vertical left rail, flat
     night-list, show-days-only).
  2. **Payroll** — *not a left rail at all*: a horizontal **week-tab** strip +
     a 7-column week table. The "week rail" in the brief is really week
     **tabs**, not a left rail.
- **Rooming** (the next consumer) currently has **no rail** — routing days are
  the **columns** of a matrix. The three rooming views need a left rail bolted
  on, which is the whole point of this build.
- **Budget context band** has **no day list** — tour identity + tabs only.
- Day-type colour tokens already exist (`--color-lp-day-*`, 8 of them) and a
  CSV-aware `DAY_TYPE_TOKEN` map is already duplicated in two files — the rail
  should own the canonical copy.

---

## 1. Inventory — every existing rail / day-list implementation

### 1a. Advance routing sidebar ✅ (real left rail)

| | |
|---|---|
| **File** | `src/components/advance/AdvanceUpcomingSidebar.tsx` |
| **Props** | `{ tourId: string; tourName: string; activeRoutingId: string }` (lines 27–32) |
| **Mounted by** | `src/app/(app)/advance/[tourId]/[routingId]/page.tsx` (lines 261–265) |
| **Data read** | `GET /api/tours/[tourId]/advance?all=true` → `AdvanceDateItem[]` |
| **Underlying query** | `src/app/api/tours/[id]/advance/route.ts` L72–76: `supabase.from('routing').select('id, date, day_type, city, venue_name, address').eq('tour_id', tourId).order('date')` then joined with `advance_instances` + `advance_form_configs` |
| **Layout** | **Flat chronological night-list** (`<ul>` of `<li><Link>`), NO week grouping (L277–374) |
| **Filtering** | **Show days only** — `isShowDay()` keeps `day_type` containing `show`/`festival` (L34–37, L123) |
| **Entry shows** | date label (e.g. `22 MAY 2025`), venue_name ∥ city, plus Advance-specific extras: a **completion % progress bar** and an **"N overdue" badge** |
| **Day-type pill** | **None rendered** — `day_type` is used only for filtering/search, not shown |
| **Selected state** | `active = d.routing_id === activeRoutingId`; styled with `borderLeft: 2px solid var(--color-lp-orange)` + `background: var(--lp-surface)` (L288–293) |
| **Click** | `<Link href={`/advance/${tourId}/${d.routing_id}`}>` — full navigation, not a callback |

**Sibling reference (not a rail, but the day-type rendering to match):**
`src/components/advance/AdvanceOverview.tsx` renders a day-type colour bar +
label via `colourForDayType()` (L108–112) and `getDayTypeLabel()`. Its
`DAY_TYPE_TOKEN` map (L90–99) is the canonical CSV-aware token mapping (below).

### 1b. Payroll "week rail" ⚠️ (week TABS + 7-col table, not a left rail)

| | |
|---|---|
| **Files** | `src/components/payroll/PayrollView.tsx` (L10–113), `src/components/payroll/PayrollWeekSheet.tsx` (L29–271), `src/components/payroll/payroll-utils.ts` |
| **Mounted by** | `src/app/(app)/operations/[tourId]/payroll/page.tsx` (L40 fetches `routing.select('*')`) |
| **Props (View)** | `{ tourId; tourName; currency; routingDates: { id; date; day_type?; venue_name?; city? }[]; personnelRates; payrollEntries }` |
| **Data read** | `routing` columns: `id, date, day_type, venue_name, city` (passed down as `routingDates`) |
| **Layout** | **Week-grouped** — `getWeekStart()` (Monday-based ISO week, payroll-utils.ts) buckets dates; top strip is a **horizontal tab per week** labelled `WC 18 May` via `formatWeekTabLabel()` (PayrollView L39–54). Each week renders `PayrollWeekSheet` = a 7-column Mon–Sun table; routing days are **columns**, personnel are **rows** |
| **Entry shows** | per-day column header: short weekday (`formatShortDate`), `venue_name`, `city` (PayrollWeekSheet L168–201) |
| **Day-type pill** | day_type **collapsed to 3 buckets** by `dayTypeToStatus()` → `show` / `off_travel` / `no_tour` (L21–27); coloured cell backgrounds (**hardcoded Tailwind** `bg-emerald-500/20`, `bg-amber-500/20`, `bg-gray-500/10` — token violation, L232–244) |
| **Selected state** | `activeTab` = week-start string (or `'summary'`) |
| **Click** | tab click → setState (no nav); per-cell click → inline `<select>` to set day status → `POST /api/budget/payroll` |

> ⚠️ Payroll's day-indexing axis is **horizontal (columns)**, and its day-type
> palette is collapsed to 3 buckets + hardcoded Tailwind. Retrofitting it to a
> left rail is a **layout change**, not a drop-in — see §4 / §5 Decision D2.

### 1c. Rooming ❌ (no rail today — routing days are matrix columns)

| | |
|---|---|
| **Files** | `src/components/rooming/RoomingView.tsx` (L27–117), `RoomingMasterGrid.tsx` (L39–326), `RoomingHotelSheet.tsx` (L42–191) |
| **Mounted by** | `src/app/(app)/operations/[tourId]/rooming/page.tsx` (live) + legacy `src/app/(app)/tours/[id]/rooming/page.tsx`; both `routing.select('*').order('date')` |
| **Props (View)** | `{ tourId; tourName; currency; routingDates: { id; date; venue_name?; city?; day_type? }[]; hotels; roster }` |
| **Layout** | **Master grid**: routing dates are **column headers** (city / `day_type.toUpperCase()` / formatted date — L282–304), roster persons are rows, cells indexed `${person}:${routing_id}`. **Hotel sheet**: flat per-person table (check-in/out/nights/rate) — **not** day-indexed |
| **Rail today** | **None.** This is exactly what the shared rail is for: rooming's 3 views (matrix, nights, cards) should each become "left rail + right panel" |

### 1d. `/tours/[id]` & `/operations/[tourId]` routing surface ❌ (flat editable table, no rail)

| | |
|---|---|
| **Files** | `src/components/routing/RoutingGrid.tsx` (L198–295), `RoutingEditor.tsx` (L123+), `RoutingCalendar.tsx`, `RoutingMap.tsx` |
| **Mounted by** | `src/app/(app)/operations/[tourId]/routing/page.tsx` (L52–178) wraps `<RoutingEditor>` |
| **Row type** | `RoutingRow` (RoutingGrid L22–35): `date, day_type, city, address?, venue_name?, venue_website?, venue_phone?, venue_capacity?, notes?, latitude?, longitude?, transport_to_next?` |
| **Layout** | **Flat editable table** (one row per date + a `TravelBox` between rows showing drive time/distance). Indexed by `row.date`. **No left rail** |

### 1e. Budget context band ❌ (no day list)

`src/components/budget/BudgetContextBand.tsx` (L34–86) = sticky bar:
`TourIdentityChip` + tabs (Summary/Expenses/Income) + Reports/Settings + density/export.
**No routing data, no day list, no rail.** (Listed in the brief to confirm — confirmed absent.)

---

## 2. Differences a shared `<RoutingRail>` must absorb

| Axis | Advance | Payroll | Rooming (target) | Routing surface |
|---|---|---|---|---|
| **Orientation** | vertical left rail | horizontal week tabs + columns | needs vertical left rail | horizontal table |
| **Grouping** | flat night-list | **week-grouped** (Mon ISO) | likely flat (TBD) | flat |
| **Which days** | **show/festival only** | all days in week | all days (incl. off/travel) | all days |
| **Selected model** | `activeRoutingId` (URL) | `activeTab` (week string) | `selected` routing_id (state) | n/a |
| **Click** | `<Link>` navigation | setState | `onSelect` callback | inline edit |
| **Day-type pill** | none shown | 3-bucket, hardcoded Tailwind | full 8-type pill wanted | none |
| **Entry content** | date · venue/city · **+progress/overdue** | weekday · venue · city | date · city/venue · day-type | full editable row |
| **Extra per-entry slot** | progress bar + overdue badge | — | (room counts?) | — |

**Implications for the API:**
- Must support **both** `grouping: 'night'` (flat) **and** `grouping: 'week'`
  (Monday ISO buckets — reuse `getWeekStart`/`weekDates`/`formatWeekTabLabel`
  from `payroll-utils.ts`, don't reinvent).
- Must support **filtering upstream** (Advance passes only show days) — the rail
  should render whatever `entries` it's given; the **caller** filters. (Don't
  bake `isShowDay` into the rail.)
- Selection must be **caller-controlled**: `selected` + `onSelect(id)`. Advance
  adopts it by having `onSelect` push the route; Rooming by setState. The rail
  itself stays navigation-agnostic.
- Needs an **optional trailing slot** per entry (`renderMeta?(entry)`) so
  Advance can inject its progress bar / overdue badge without the rail knowing
  about Advance concepts.
- **Day-type pill** is a first-class rail feature (date · city/venue · pill),
  using the real tokens — Payroll's 3-bucket collapse is a *caller* concern, not
  the rail's; the rail shows the true `day_type`.

---

## 3. Canonical `RailEntry` shape (derived from the real `routing` table)

**Source of truth:** `routing` table — `database/migrations/001_initial_schema.sql`
L104–116, extended by 008 (`address`), 009 (`latitude`/`longitude`/
`transport_to_next`), 011b (`day_type` default → `''`), 015 (venue extras).
TS mirror: `RoutingDate` in `src/types/index.ts` L127–153.

Real, cited columns (no invented fields):

```
routing.id           UUID  PK
routing.tour_id      UUID  FK → tours(id)
routing.date         DATE  NOT NULL            ← rail entry date
routing.day_type     TEXT  DEFAULT '' (011b)   ← day-type; CSV-capable ("show,festival"); NO CHECK constraint
routing.city         TEXT  DEFAULT ''          ← rail city
routing.venue_id     UUID  FK → venues(id)
routing.venue_name   TEXT  (denormalised)      ← rail venue
routing.sequence     INT   DEFAULT 0           ← tie-break ordering within a date
routing.address      TEXT  (008)
routing.latitude/longitude  DOUBLE (009)       ← weather/map later
routing.transport_to_next   TEXT (009)
```

Notes that shape the rail:
- **`day_type` is free TEXT, not an enum** — `grep` finds **no CHECK constraint**
  on it. It can be a **CSV** (`"show,festival"`) and `tours.custom_day_types
  TEXT[]` (migration 010) allows user-defined types. ⇒ the rail must degrade
  gracefully for unknown/multi types (take the first via `firstDayType()`,
  fall back to the `off` token).
- **No `shows` table** — `routing` is canonical. `ShowEntity`
  (`src/lib/entities/show.ts`) selects `id, tour_id, date, day_type, city,
  venue_name` and is the lightweight read.
- **No `weather` column today** — leave a typed-optional `weather?` in the rail
  entry but do **not** wire it (Decision D4).

### Proposed `RailEntry` (Stage B will define in code)

```ts
interface RailEntry {
  id: string;            // routing.id  (selection key everywhere)
  date: string;          // routing.date 'YYYY-MM-DD'
  city?: string;         // routing.city
  venueName?: string;    // routing.venue_name
  dayType?: string;      // routing.day_type (raw, CSV-capable)
  // reserved, not wired in Stage B:
  weather?: never;       // Decision D4 — placeholder only
}
```

Every existing caller already has these fields in the prop it passes
(`routingDates` in Payroll/Rooming; `AdvanceDateItem` in Advance via
`routing_id`→`id`) — so adapters are trivial 1:1 maps, no new queries.

> **Forward note (relational principle — not in this build).** `RailEntry` is
> deliberately **tour-level + presentational**: one row per `routing.id`, the
> rail renders whatever `dayType` it's handed. The day model will soon need
> **per-person day-type overrides** (e.g. a tech's extra de-prep day) and
> **budget-line generation** off days. Those resolve at the **data layer** —
> the caller computes the effective per-person day and passes it in `dayType`;
> the rail needs no change. The build is careful **not to preclude** this: no
> person/budget logic is baked into the rail, and `id` stays the stable routing
> key a per-person override can hang off. Design the override/budget work as a
> data concern feeding the same `RailEntry` shape.

---

## 4. Unify plan

### Proposed `<RoutingRail>` API

```ts
interface RoutingRailProps {
  entries: RailEntry[];                 // caller pre-filters (e.g. Advance = show days only)
  selected: string | null;             // routing.id
  onSelect: (id: string) => void;      // caller decides nav vs setState
  grouping?: 'night' | 'week';         // default 'night'; 'week' = Monday ISO buckets
  renderMeta?: (e: RailEntry) => React.ReactNode;  // optional trailing slot (Advance progress/overdue)
  showDayTypePill?: boolean;           // default true; date · city/venue · pill
  ariaLabel?: string;
}
```

- **Location:** `src/components/routing/RoutingRail.tsx` (the existing
  `src/components/routing/` dir, alongside `RoutingGrid`/`RoutingEditor`).
- **Tokens:** `var(--lp-…)` throughout; **day-type pill colours** from the
  existing `--color-lp-day-*` tokens via the canonical `DAY_TYPE_TOKEN` map
  (currently **duplicated** in `AdvanceOverview.tsx` L90 and
  `TourOverviewClient.tsx` L34) — Stage B extracts ONE copy (e.g.
  `src/lib/routing/dayType.ts`) and both the rail and those two files import it.
  Selection highlight reuses Advance's `borderLeft: 2px solid var(--lp-orange)`
  + `background: var(--lp-surface)`.
- **Week grouping:** reuse `getWeekStart` / `weekDates` / `formatWeekTabLabel`
  from `payroll-utils.ts` (promote to `src/lib/routing/` if cleaner) — do not
  re-derive ISO weeks.
- **Filtering stays with the caller** (Advance keeps `isShowDay`).

### Stage B retrofit scope

| Surface | Stage B | Later | Why |
|---|---|---|---|
| **Payroll** | ✅ retrofit the week navigation to consume `<RoutingRail grouping="week">` (the brief's explicit target) | — | proves the week-grouped path + replaces hardcoded Tailwind day colours with tokens |
| **Rooming** | ➖ not in B, but the rail must be **ready to drop in** on the left of all 3 views | ✅ rooming sprint | rooming is the reason the floor is being built |
| **Advance** | ➖ leave `AdvanceUpcomingSidebar` as-is; just **note the shared API** so it adopts next (it needs `renderMeta` for progress/overdue) | ✅ Advance adopt | "leave Advance as-is unless trivial" per brief |
| **Routing surface** (`RoutingGrid`) | ❌ no change | maybe | it's an editable table, not a rail |
| **Budget context band** | ❌ n/a | — | no day list |

> ⚠️ **Open caution on Payroll:** its day axis is currently **horizontal
> columns**. Swapping to a left rail is a real layout reshape (rail on the left,
> the week's per-person grid on the right). If that's more than the brief wants
> for Stage B, the minimal alternative is to ship `<RoutingRail>` + retrofit
> only the **week-tab strip** to be rail-driven and leave the 7-column sheet.
> Flagged as **Decision D2**.

---

## 5. Decisions needed from Adam (before Stage B)

- **D1 — Day-type token naming.** Components reference `var(--color-lp-day-*)`
  directly, but CLAUDE.md says "reference `var(--lp-…)`". Add thin aliases
  `--lp-day-*: var(--color-lp-day-*)` in `globals.css` (mirror the
  `--lp-orange` pattern) and have the rail use `--lp-day-*`? Or use
  `--color-lp-day-*` as-is? (Recommend: add the aliases — consistent with the
  P0 dead-token fix.)
- **D2 — Payroll retrofit depth.** Full reshape to "left rail + right grid", or
  minimal "make the existing week strip rail-driven" for Stage B? (See §4
  caution.) This decides how much Payroll changes.
- **D3 — Pill content for non-show days on Advance.** Advance currently shows
  **no** day-type pill (and only show days). When other surfaces show the pill,
  Advance keeps `showDayTypePill={false}`? (Recommend: yes — preserve current
  Advance look; it adopts the pill only if you want it later.)
- **D4 — Weather.** The brief lists "weather?" as a maybe. `routing` has
  **lat/long but no weather column**. Leave `weather` as an unwired placeholder
  in the type (recommended), or is wiring weather in-scope (needs a data source
  + likely a column/migration)?
- **D5 — `grouping` default & rooming.** Default `grouping='night'` (flat).
  Confirm rooming's 3 views want flat night-list (not week-grouped) so the rail
  default matches the dominant consumer.

---

## 6. Hard-rule compliance (Stage A)

- ✅ Both sides mapped before any code; **real routing columns cited** (001 +
  008/009/011b/015; `RoutingDate` `types/index.ts` L127–153) — nothing invented.
- ✅ Confirmed **no shared rail exists** and **no `shows` table** exists.
- ✅ Confirmed day-type tokens exist (`globals.css` L78–86) and the CSV-aware
  `DAY_TYPE_TOKEN` map is duplicated in 2 files (extract in B).
- ⛔ **No code written.** Stopping here for review of §5 before Stage B.

### Stage B smoke IDs (to land with the build — placeholders here)

New file `docs/smoke-tests/routing-rail.md` (or fold into payroll/rooming):
- **RAIL-01** rail renders date · city/venue · day-type pill, token-coloured.
- **RAIL-02** selected entry highlighted (orange left border + surface bg).
- **RAIL-03** `onSelect` fires with `routing.id`; caller controls nav vs state.
- **RAIL-04** `grouping='week'` buckets by Monday ISO week with `WC dd Mon` headers.
- **RAIL-05** Payroll uses the shared rail; **looks identical** to before (Adam live-verifies on preview).
- **RAIL-06** unknown/CSV/custom `day_type` degrades to first-type / `off` token (no crash, no blank pill).
