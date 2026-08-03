# S-1 → S-5 — running report

One entry per bank, written as it lands. Coverage over coffee, not diffs.

**Standing rules in force:** every bank green (tsc 0, eslint 0, `next build
--webpack`, money 64/21/15) and pushed with Vercel success before the next
starts · `main` deployable at every point · no migrations (SQL parked for Adam)
· nothing irreversible · ambiguous calls parked, not decided.

---

## S-1 — the canonical shell, proven on Routing · `<commit>`

**Built**
- `src/lib/nav/ia.ts` — the whole IA as data: 4 scopes, 3 tour modes, every rail
  group/item/href/badge, plus pure resolvers (`resolveScope`, `modeForPath`,
  `railFor`, `activeItemFor`, `modeLandingHref`, `upFrom`, `isUnshelledPath`).
  **95 unit tests** across every URL shape in IA_CANONICAL.
- `<AppShellV3>` (server) + `<TopBarV3>` + `<NavRail>` (client) +
  `<ShellV3Mount>` — the one-line mount that fetches the top bar's data.
  **13 render tests** proving the cold-URL contract.
- Pathname reaches the server via an `x-pathname` request header set in
  `supabase-middleware.ts`.

**Mounted on:** `/operations/[tourId]/routing` **only**. The layout branches on
the pathname; every other route under `/operations` is byte-identical to before.

**Retired on Routing only:** the G2-4 identity band (the top bar carries artist
+ tour now — showing both would state the same facts twice). It still renders
everywhere else.

**Decisions taken, with reasons**
- *Nav rail vs day rail:* they stay separate components. On Routing the **app
  rail starts collapsed** (`denseRail`) so the R5 day rail keeps its width. Two
  full-width rails at 1440 leaves ~950px for the routing ledger, which isn't
  enough. The app rail is a glance; the day rail is a working surface, and the
  surface you work in shouldn't be the one that shrinks. User's own collapse
  preference overrides it and persists.
- *One picker:* `<ArtistTourSwitcherClientWrapper>` — literally the component
  shell-v2 already renders — passed into the top bar as a slot. Hidden at
  workspace and You scope. There is no second picker.
- *Unbuilt pages* (Travel, Per diems, Spaces & cases, Movements, Year budget,
  Contacts, Patch, Manifests, Templates, Billing) render **disabled with a
  tooltip** rather than being hidden. IA_CANONICAL calls these missing *pages*,
  not missing nav — a visible empty slot is the point.

**Found**
- IA_CANONICAL writes Day sheets as `/operations/[tourId]/day · /day/[routingId]`,
  which reads as a top-level `/day` route. **There isn't one** — the per-day page
  is nested at `/operations/[tourId]/day/[routingId]`. Noted in `ia.ts`.

### S-1 FIX — Routing 500'd on the first deploy · `<commit>`

**What broke:** `<AppShellV3>` is a server component and passed `railFor()`'s
output straight to `<NavRail>`, a client component. Those entries carry `href`
and `match` as **functions**, and a function cannot cross an RSC boundary —
React threw during the server render. Routing showed "Something went wrong";
every unmigrated page was fine, which is what localised it.

**Why nothing caught it:** tsc, eslint and `next build` never see the boundary,
and the jsdom tests render the server component as a plain function call, so
there is no boundary there either. Confirmed: tsc still passes when the broken
shape is reinstated.

**Fix:** `resolveRailView()` in ia.ts does all the function work on the server —
builds hrefs, runs matchers, reads badges — and returns plain data.
`<NavRail>` now consumes `RailView` and imports only a *type* from ia.ts.

**Guard:** `railViewIsSerialisable()` + 6 tests asserting the property rather
than the render — the resolved view survives a JSON round-trip, the raw config
does not. Checkable without an RSC boundary, which is the point.

**Lesson for S-2 onward:** anything handed from a layout to a client shell
component must be plain data. The config module keeps its functions; they stop
at the server.

### S-1 FIXPACK — SHELL-06 + SHELL-07 from Adam's walk · `<commit>`

Smoke result: 6 pass, 2 fail, 1 skipped (screenshots).

**SHELL-07 — "Nothing on hover"** and **SHELL-06 — "No tooltips"**: same cause,
mine. I used the native `title` attribute, and the rail sets `overflow:hidden`
for its width transition — which clips anything that would sit beside an icon.
Native tooltips also need a second of stillness before appearing, which is no
use to someone scanning a 52px icon strip. Replaced with a real tooltip:
fixed-positioned so it escapes the rail's clipping box, instant on hover, and
**on keyboard focus too**, which `title` never gave us.

A dead item now explains itself **expanded as well as collapsed** — "Travel — no
page yet". That's the half of SHELL-07 that mattered: expanded, the label is
visible but the deadness isn't.

**SHELL-06, second half — "icons move a handful of pixels when they fold away,
hard to trace which is which".** A separate real bug: a group heading is 30px
expanded and collapsed to a 17px hairline, so every icon below slid up 13px per
group. Group slots are now a fixed 30px in **both** states — the grouping changes
appearance when the rail folds, never position. Muscle memory only works if
things stay where they were.

**Guarded:** 8 tests. The tooltip ones assert content on hover and on focus; the
layout one asserts the *slot height* matches across states, which is the thing
that has to be equal — the appearance is meant to differ.

### S-1 FIXPACK 2 — clicking a nav item said nothing · `<commit>`

Adam, second walk: *"there's no interaction when you click a menu item, it just
loads silently then the new screen appears."* Correct, and worse than cosmetic —
for the second a cold lambda takes, an app that heard the click is
indistinguishable from one that ignored it, so people click again.

`useLinkStatus()` (Next 15.3+) reports the pending state of the nearest parent
`<Link>`, which is why the three helpers in `PendingNav.tsx` are components
rendered *inside* a Link rather than a prop computed outside one — the hook
reads context the Link provides.

Two signals, deliberately:
- **Optimistic active.** The clicked row takes the destination's look at once —
  orange marker and tint. Drawn as an overlay because the style it must match
  lives on a parent the hook can't reach; `left:-2` reaches back over the row's
  own transparent 2px border so the marker lands exactly where the real one
  does, not 2px inside it.
- **Icon → spinner, swapped not appended.** The row keeps its geometry, so
  nothing shifts under the cursor mid-click, and it works in the 52px collapsed
  rail where there is nowhere to append. Same trick on the mode pill's icon, the
  ↑ arrow and the workspace mark: each is already a fixed-width slot.

The mode pill tints translucently rather than filling orange — an opaque overlay
would paint over its label.

Nothing fires on a prefetched navigation: `pending` never flips if the payload
is cached, so feedback appears exactly when there's a wait worth acknowledging.

**Guarded:** 15 tests in `PendingNav.test.tsx`, which replaces `useLinkStatus`
and holds every link in one state at a time — jsdom has no router. Revert-check
done: with the swap disabled, 6 of them fail. Also pinned: a dead item (Travel)
never shows a spinner, because it isn't a Link at all.

**Smoke:** SHELL-13.

**Still on old chrome:** everything except Routing. See the S-2 entries below as
they land.

---

## S-2a — tour scope · Tour mode · `<commit>`

**Migrated:** Routing, Day sheets, Crew (personnel), Rooming, Files, and both
Advance surfaces. That is all of Tour mode, and nothing else.

**The boundary is now data, not a regex.** `isShelledPath()` in ia.ts answers
"is this URL on the canonical shell", and the layouts ask it instead of each
carrying their own pattern. A bank is one entry added to `SHELLED_TOUR_MODES`;
a revert is that entry removed. 23 tests assert exactly which surfaces have
crossed and which haven't — including that Payroll, which lives under
`/operations`, is Money and therefore has NOT.

That matters because "a half-migrated app" is the stated failure mode. It stays
survivable only while someone can say which half, in one place, without reading
three layouts.

**Both corrections from your walk, fixed:**

- **`denseRail` was on the wrong page.** S-1 collapsed the app rail on Routing
  on my assumption that the routing page owned the R5 day rail. It doesn't —
  `<RoutingRail>` is rendered by Rooming, the per-day page and the per-show
  Advance surface. `hasDayRail()` now names those three, so the app rail only
  shrinks where something is genuinely competing for the width, and Routing
  gets its full rail back. Test: *"ROUTING DOES NOT HAVE ONE"*.
- **The picker flashed "Pick an artist…".** A tour URL carries only the tour id,
  so the context had nothing until `<HydrateTourArtist>` ran in an effect — on
  a tour page, where the server knew the answer before it rendered a byte.
  `fallbackArtistName` / `fallbackTourName` thread the loaded names through
  ShellV3Mount → wrapper → switcher as the LAST fallback in the chain, so
  anything the context or the fetched lists know still wins and they can't go
  stale.

**Kept, and easy to have lost:** `<RememberTourProduct>` was a ProductShell
behaviour. Had it not moved across, the workspace Resume card would have gone
on offering whichever product you last opened on OLD chrome — quietly wrong,
and invisible until someone noticed Resume had stopped tracking. It's one
zero-render island in AppShellV3 now, keyed off `productForPath()`.

**Frame parity:** the shell root now sets `overflow:hidden` + `--lp-bg` /
`--lp-text` exactly as ProductShell did, so `<main>` stays the only scroll
surface — that's what sticky headers inside a page body anchor to.

**Found, not fixed:** `/operations/[tourId]/labor`, `/summary` and `/edit`
resolve to Tour mode and are now shelled, but no rail item claims them, so the
rail highlights nothing. That's ia.ts's documented honest failure rather than a
guess. `/summary` is scheduled for deletion in S-4; Labor calls is reached from
Day sheets → Schedule by design (IA_CANONICAL), so it has no rail item on
purpose.

**Smoke:** SHELL-14 … SHELL-19.

---

## S-2b — tour scope · Money mode · `<commit>`

**Migrated:** Budget (every tab), Settlement, and **Payroll** — which lives at
an `/operations/…` URL and crossed with Money, not with the Operations folder,
because the rail is organised by what a thing is. One entry added to
`SHELLED_TOUR_MODES`; the layouts needed no new logic, which was the point of
S-2a doing the boundary properly.

**The budget tabs now exist once.** The rail carries Summary / Expenses /
Income / Receipts / Reports, so `<BudgetContextBand>` drops its tab strip and
keeps only what nothing else offers: the version selector, the density toggle
and Export. Same reasoning that retired the identity band on Routing — two navs
saying the same thing is the condition this shell exists to end. The band asks
`isShelledPath()` itself rather than taking a prop, so it can't drift from what
is actually mounted.

**The Receipts count had to move, not vanish.** It was rendered on the tab
strip — the one number on that bar anybody acts on. `countReceiptsNeedingDetails()`
now feeds the rail badge on **every** Money surface, not just Budget, because
the rail is on Settlement and Payroll too. It's a lean two-query read that
deliberately does NOT pull `raw_ocr_json` (large, and financial/PII), and it
shares `deriveReceiptState` with the bank loader — two definitions of "needs
details" would drift, and a badge disagreeing with the list it points at is
worse than no badge. It rides the existing `Promise.all`, so no extra
round-trip depth on a cold lambda.

**A zero is not a badge.** Every badge in this rail counts work — days, lines,
unsettled shows, receipts. `resolveRailView` now drops `0`, so clearing the last
receipt removes the number instead of parking a "0" beside an item that wants no
attention. Put in the resolver rather than the caller so it holds for every
badge; 5 tests, and the old code returned `'0'`.

**Not done, deliberately:** the other badge keys (`days`, `lines`, `unsettled`,
`tours`, `artists`, `gear`, `advanced`) are still unfed — they never existed in
the old chrome, so nothing regressed, and each needs its own query. Worth doing
as one deliberate pass rather than smuggled into a chrome bank.

**Label divergence to settle:** the rail says "Reports & workbook"
(IA_CANONICAL); the tab it points at was labelled "Settings". Same destination,
`?tab=settings`. Adam's call which name is right.

**Smoke:** SHELL-20 … SHELL-23.

### S-2b FIXPACK — the day-rail predicate, twice wrong · `<commit>`

Adam, second walk: *"hasDayRail() is still slightly wrong, same class as
denseRail. Rooming only shows the RoutingRail in its CARDS view."*

Correct, and worse than reported. Rooming's view is component state defaulting
to **Matrix**, so the collapsed rail wasn't wrong on two views out of three —
it was wrong on **every arrival**. You only saw the good case by clicking into
Cards.

**Rooming is out, per-path granularity accepted.** The alternative — a
view-aware shell — was the wrong trade twice over. Chrome that waits for a
client component to report which view is showing puts chrome back on ambient
state, which is the exact dependency S-1 exists to remove; and moving the view
into the query would keep the rule but cost a server round-trip on every toggle
of an instant segmented control. So Rooming stays expanded, and in Cards the
collapse control is one click and persists.

**A third page turned up while checking properly:** the rider pack editor
renders a 280px `RiderPackSidebar` — unconditionally, on `/riders/[id]` but not
on the pack list. So the predicate is now **`hasOwnRail`**, not `hasDayRail`:
not every competing rail is a day rail, and a name that says otherwise is how
the next person guesses instead of checking. Each of the three is asserted with
the word *unconditionally*, because "only in one view" is precisely what went
wrong here.

**Labor calls lights Day sheets.** Adam: *"if the rail highlights NOTHING at all
it reads as broken."* It has no item of its own by design — IA_CANONICAL reaches
it from Day sheets → Schedule — but "no item" and "nothing highlighted" look
very different to someone using the thing. It lights its parent, which is where
you came from and where you'd go back to.

**"Reports & workbook" wins**, Adam's call. The `?tab=settings` VALUE stays, so
no bookmark breaks over a rename.

---

## S-2c — tour scope · Production mode — TOUR SCOPE COMPLETE · `<commit>`

**Migrated:** Assets (hire), Channel list, Stage plot, Riders and rider packs.

**One entry in `SHELLED_TOUR_MODES`.** No layout changed, no new branch, no new
regex — which is exactly the return on doing the boundary properly in S-2a. The
only real work was checking, not writing: confirming the four Production pages
carry no chrome of their own that would now double, and finding the rider
editor's sidebar before it shipped as a third wrong guess.

**Every tour-scoped URL is now shelled**, which means the `ProductShell` branches
in the three tour layouts are unreachable. They stay this bank and go in S-2d,
along with the two-bar nav and OperationsGroupSubNav — one bank, one thing, and
a dead branch is a safer thing to have on `main` overnight than a deletion that
wasn't verified. A test asserts the completeness that lets S-2d start.

**Smoke:** SHELL-24 … SHELL-28. SHELL-19 retires — there is no boundary left
inside the tour to check.

---

## S-2d — retire the old tour chrome · `<commit>`

**Deleted:** the `<ProductShell>` branch in all three tour layouts, plus three
components whose last caller went with them —
`OperationsGroupSubNav.tsx`, `TourIdentityBand.tsx`, `IdentityLockup.tsx`.
Grep after: **0 references** to any of the three anywhere in `src`.

**NOT deleted — and this is the answer to your "if they share a component"
check:** `ProductShell` and `ProductHeader` **survive**. They are still the
chrome for fifteen surfaces that are nobody's tour:

- **Artist scope (S-3a)** — `artists/[id]/(home)/layout.tsx`,
  `artists/[id]/(library)/layout.tsx`, `artists/[id]/edit/page.tsx`
- **Workspace / You (S-3b)** — `settings`, `settings/members`,
  `settings/ai-limits`, `venues`, `bugs`, and the three product LANDINGS
  (`/operations`, `/budget`, `/advance` with no tour id, which resolve to
  workspace scope, not tour)
- `RiderPackEditorView` uses it for its standalone mode

So the two-bar nav dies with S-3b, not here. Deleting it now would have taken
the artist tier down, which is exactly the trap you asked me to check for.

**The layouts no longer branch at all.** I dropped the `isShelledPath()` guard
rather than keeping it as a runtime assertion: it would re-check something the
tests already pin, and its failure mode — a 404, or a page rendering with no
navigation — is worse than what it guards against. The boundary lives in ia.ts
and in the test that reads it; the layout just mounts.

### FOUND — the rail does not filter by resource access

Deleting the sub-nav is what surfaced this, so it is worth being exact about.

`OperationsGroupSubNav` filtered its eight links by
`canAccess(membership, grants, 'page', 'operations.<x>', 'read')`. The rail has
no equivalent, so a readonly member with no Payroll grant now **sees** Payroll
in the rail where they previously didn't.

**This is discoverability, not access, and it is not new.** Only `personnel` and
`routing` gate themselves server-side; the other six pages never did, so those
URLs were always reachable by typing them. And the loss landed in **S-2a**, when
the shelled branch stopped rendering the sub-nav — S-2d only removes the dead
code that made it look like the filter still existed.

**Not fixed here, deliberately.** Accepted and scheduled by Adam as **P-1, to
run after S-4**:

- A serialisable allow-list resolved server-side in `ShellV3Mount`, a `resource`
  field on the rail items that have one, and a membership+grants fetch on every
  shelled surface — a cost F-3(b) deliberately drove down, so the fetch shape
  matters.
- **Covers the Money and Production rails too**, not only the eight ex-sub-nav
  items. The sub-nav never reached Budget or Advance, so "restore parity" is the
  floor, not the target.
- **Acceptance is a real second account**: a readonly member with no Payroll
  grant, logged in, seeing no Payroll item. Not a unit test — a unit test proves
  the allow-list matches itself, and the thing actually at issue is whether it
  matches what the server enforces.
- The report must state plainly that **six of the eight URLs were always
  reachable by typing**, so P-1 closes DISCOVERABILITY and not access. Access is
  a separate audit and does not get to hide behind this one.

### Patch is not a surface

Your note, and you were right. Patch is **built** — it ships as a mode of
Channel list, where the PATCH toggle swaps `<PatchMatrix>` in for the input
grid. There is no `/patch` route and none planned, so greying it in the rail
told the user that working software was missing. Dropped, so greyed means one
thing only.

Pinned by a test that asserts the **whole greyed set per rail**, not just this
case — adding a disabled item is now a deliberate act with a test to update.

### Rooming matrix — looked, and it is the empty state

Rows come from `tour_personnel`: one per roster member, whether or not they hold
a room. Cells are empty until something is assigned, which is what makes it an
entry grid rather than a report — so an unassigned tour correctly shows a grid
of blanks.

The failure worth looking for instead is a row labelled **"Unknown"**. The page
falls back `person name → role → "Unknown"`, so that label means a roster entry
with no linked person AND no role — a data problem, not a rendering one. If
that's what you saw, say so and I'll chase it; if the rows were named with empty
night cells, nothing is wrong.

**Smoke:** SHELL-29 … SHELL-31.

---

## S-3a — artist scope · `<commit>`

**Migrated:** the artist landing, the Production hub, Edit, and every library
surface — riders, channel-lists, stage-plots, files, financials.

**Three chrome wrappers became one.** `(home)/layout.tsx`,
`(library)/layout.tsx` and a per-page `<ProductShell>` inside `edit/page.tsx`
are replaced by a single `artists/[id]/layout.tsx`. There were three because a
route-group layout can only wrap its own group, so Edit — which sits outside
both groups — had to carry its own copy and could drift from the other two.
Sitting above the groups removes that by construction, and it still does what
the `(home)` layout was written for: the picker survives /artists/A →
/artists/B.

**It fetches nothing.** The artist id is in the path, and ShellV3Mount was
already loading the artist list for the picker — so the top bar's artist name
comes out of data it was fetching anyway. No new query on any artist page.

### Two rail items did not survive contact with the routes

IA_CANONICAL was transcribed in S-1 from the document, before these routes had
been checked against the filesystem.

**TOURS is not a second page.** `/artists/[id]` **is** the tour list — hero plus
tours, with Production and a locked Business as hero tabs. IA_CANONICAL lists
Overview and Tours as separate rail items; two items on one URL means one of
them can never light, which is the Patch mistake wearing a different hat.
Dropped. Overview is the landing, and the landing is the tours list.

**Three sub-routes had no item at all** — Edit, the Production hub, and the
Financials stub. Overview claims all three, same call as labor → Day sheets: a
rail showing nothing lit reads as broken, and all three are reached from the
landing anyway.

### Found

- **The artist library had no way in from outside its own tree.** Nothing in the
  app linked to `/artists/[id]/riders`, `/channel-lists`, `/stage-plots`,
  `/files` or `/financials` — they were reachable only from within the artist
  pages. The rail is now the front door, which is a real gain from this bank
  rather than a like-for-like port.
- **`/artists/[id]/financials` is a stub** — "no model yet", by Adam's earlier
  call, existing so the URL space is complete. Nothing links to it and it has no
  rail item. A candidate for the S-4 deletion list; not touched here.
- **Production is not a rail item**, per IA_CANONICAL, so it stays reachable
  from the hero tab only. Worth a look at S-3b whether the hub earns a slot.

**Smoke:** SHELL-32 … SHELL-37.

---

## S-4a — the live bugs · `<commit>`

Three items briefed. **One was real, one was already fixed, and one was
misdiagnosed** — so this bank is five lines of `next.config.ts` and nothing
else. Writing that down rather than finding work to justify the bank.

### 1. The two `/rooming?tour_id=` components are DEAD, not broken

`RoomingTourRedirect.tsx` and `BudgetTourSelector.tsx` do push at a URL that
now dead-ends — but **nothing imports either of them**. Zero call sites, whole
repo. They cannot fire.

So the fix is not to repoint them. Repointing dead code costs the same review
attention as live code and leaves the tree looking like it has a feature it
doesn't. They move to **S-4b as orphan deletions**, which is what they are.

*(That is the inverse of the "stop if a deletion has a live caller" rule — here
a REPOINT turned out to have no caller. Same principle: check before editing.)*

### 2. The Business tab is already safe

`ArtistHeroTabs` renders Business as a `<span>` with `aria-disabled="true"`,
`cursor: default`, no `href` and no `onClick`, plus a lock icon and a "Visible
to managers only" tooltip. **It cannot navigate**, so `/artists/[id]/business`
is never reachable from it. Confirmed by reading the render path, not assumed
from the comment above it. Nothing to do.

### 3. The redirects — one of the three named was fine, two others weren't

I audited **every** `/library/*` redirect against the filesystem, which is the
check nobody did when they were written. Result:

| redirect | verdict |
|---|---|
| `/library/gear/:rest*` → `/account/rental/:rest*` | **NOT broken** — `/account/rental` exists and redirects on to `/equipment`. Two hops, but it works. |
| `/library/deal-memos/:rest*` → `/budget/deal-memos/:rest*` | **404** — never built. Deal memos live on artist Production + Financials, and `/m/deal-memos`. |
| `/library/templates/:rest*` → `/templates/:rest*` | **404** — never built. The template editor is a component launched from export buttons, not a page. |
| `/library/rider-packs/:rest*` → `/operations/:rest*` | **404, not briefed** — feeds a PACK id into a TOUR id slot. |
| `/library/venues/:rest*` → `/venues/:rest*` | **404 on subpaths, not briefed** — `/venues/[id]` doesn't exist, only the list. |

**Fix: delete the three whose destinations were never built.** A redirect into
a 404 is worse than no redirect — the user lands on an error page and the URL
bar blames a route that doesn't exist, so nobody can tell whether the page died
or the redirect lied. There is already a `/library/:rest*` → `/` catch-all
sitting *after* them, so deleting the specific entries makes those URLs land on
home. No invented destinations, and the fix is a removal.

The two with real destinations were corrected rather than deleted:
`/library/gear/*` now goes **straight to `/equipment`** — one hop instead of
two, and it no longer depends on `/account/rental`, which S-4b deletes.
`/library/venues/*` drops its tail and goes to `/venues`.

**I checked my own destinations before claiming the fix** — `/equipment` and
`/venues` both resolve to real `page.tsx` files. That is the entire mistake
being repaired here; making it again in the repair would be unforgivable.

**Smoke:** SHELL-38.

**Flagged for S-4b:** `/rooming`, `/calendar`, `/rider-packs` and
`/account/rental` are not inert stubs — each is a one-line `redirect()` page,
and that page **is** the redirect. Deleting the files turns four working
redirects into four 404s for anyone with a stale bookmark, which is the
opposite of S-4c's "keep the redirects" rule. Plan: move them into
`next.config.ts` first, then delete the pages — files gone, bookmarks intact.
Will confirm before doing it.

---

## S-4b — orphans and ex-stubs · `<commit>`

**Deleted, 9 files.** Lint dropped 450 → 447 problems with them, which is the
only kind of lint movement worth having.

### The four redirect stubs → `next.config.ts`, then the pages

Your call, and it paid for itself immediately: a config redirect handles
**tails**, which a bare `redirect()` page demonstrably cannot. `/rooming/x`,
`/calendar/x` and `/account/rental/<id>` all 404'd before this bank — the stub
only ever matched the bare path. `:rest*` matches zero or more segments, so
both forms land now.

**`/rider-packs` is the exception, and it's the trap in this bank.** It is an
EXACT match, not `:rest*`, because `/rider-packs/[id]` is the live pack editor —
the Advance **share** surface links into it as `editHref`, and so does the
artist riders library. A `:rest*` there would have swallowed every one of those
links and sent them to `/artists`. Caught by grepping the id route before
writing the rule, not after.

### Deleted with zero references

| file | evidence |
|---|---|
| `RoomingTourRedirect.tsx` | 0 refs — the S-4a finding |
| `BudgetTourSelector.tsx` | 0 refs — the S-4a finding |
| `budget/rooming-recent.ts` | 0 refs **after** the above; it existed only to serve them |
| `(app)/gear/page.tsx` | 0 inbound route links |
| `artists/[id]/(library)/financials/page.tsx` | 0 inbound links |

`GearLibraryClient` is **kept** — 6 refs, mounted by both `hire` pages. Only
the standalone `/gear` route was orphaned, not the component behind it.

Deleting the financials route also meant scrubbing it from `ia.ts`: Overview's
matcher claimed `/financials` (S-3a, so the rail wouldn't sit unlit on it) and
two tests asserted that. A matcher for a page that no longer exists is dead
config that reads as intent.

### SKIPPED — `/operations/[tourId]/summary` has a live caller

Not an orphan. `operations/[tourId]/page.tsx:61` **redirects to it**:

```
redirect(canReadRouting ? `/operations/${tourId}/routing`
                        : `/operations/${tourId}/summary`);
```

It is the landing for a member who can read `operations.personnel` but **not**
`operations.routing`. Deleting it would 404 exactly those users — the ones least
able to work out why. Stopped and reported rather than rewriting the caller in
a deletion bank, per the rule.

Worth noting where this lands: the surface I was asked to delete as dead is a
**permissions fallback**, and it's the second time this pass that resource
access has turned out to be load-bearing in a way the map didn't show. That is
P-1's territory. My recommendation is that S-4 does not delete it at all and
P-1 decides whether a permission-scoped landing is still the right answer now
the rail exists.

**Smoke:** SHELL-40 … SHELL-42.

---

## S-4c — the legacy `/tours/[id]/*` tree · `<commit>`

**Deleted 17 route files + 7 orphaned components. Every redirect kept, and one
added.**

### The tail gap was real, and deleting the pages is what would have exposed it

Every `/tours/*` rule matched an **exact** sub-path. Nothing covered anything
deeper — `/tours/<id>/routing/x`, `/tours/<id>/budget/<anything-but-settlement>`,
or any sub-path a bookmark picked up before the product split. Those fell
straight through to a 404.

It was masked because some of those URLs still hit the legacy PAGES. Removing
the pages is precisely the change that turns a masked gap into a live one — the
same failure mode S-4a and S-4b each found, third time in a row.

So this bank adds a **tail backstop**: `/tours/:id/:rest*` → `/operations/:id`,
placed after every specific rule so it only catches what they miss. Bare paths
keep their precise destinations; anything deeper lands on the operations
landing, which forwards to Routing.

### Deleted, with evidence

**17 files under `src/app/(app)/tours/`** — 14 pages, one layout, two co-located
components (`TourAdvanceSummary`, `TourDetailToasts`, both 0 external refs).

No page here was reachable anyway: Next matches redirects **before** routes, so
these files had already stopped answering. The one exception was
`/tours/<non-uuid>` — the bare rule is UUID-constrained, so `/tours/create` and
friends fell through to the legacy page. They 404 now instead, which is what
they did in effect before.

**7 components orphaned by the deletion**, each 0 refs afterwards:
`TourOverviewClient` (the `components/tours/` one), `ToursListWithFilters`,
`SetupStatusStrip`, `TourSwitchDropdown`, `TourPrimaryCTACard`,
`TourSecondaryCard`, `ToursPagination` (that last one was already at 0 before
this bank).

### KEPT — five components the legacy tree shared with live surfaces

| component | still used by |
|---|---|
| `TourEditForm` | `/operations/[tourId]/edit` |
| `TourFilesClient` | operations files **and** the artist library files |
| `RiderPacksTourClient` (+ `rider-pack-rows`) | `/operations/[tourId]/riders` |
| `TourCard` | `DashboardTourCard`, `DashboardTourList` |
| `TourPhaseContextStrip` | two budget components |

This is the check that mattered. Four of the five look like tour-tree code by
name and location, and deleting `src/components/tours/` wholesale — which is
what "delete the legacy tree" invites — would have taken out Operations Edit,
Files, Riders and two budget panels.

### In-app links into `/tours/…` still exist, and still work

`TourCard`, `TourSlideOver`, `SetupStatusStrip` and others push at
`/tours/<id>`, `/tours/<id>/overview`, `/tours/<id>/personnel`. Redirects
resolve them, including on client-side navigation. They cost an extra hop per
click and should be repointed eventually — logged, not fixed here, because
rewriting live callers inside a deletion bank is the thing we don't do.

**Found, not fixed:** `src/components/tour-overview/TourOverviewClient.tsx` is a
**pre-existing** orphan — 0 refs, unrelated to this tree, name-collides with the
one deleted here. Left alone to keep the revert surgical. Same for the
`components/dashboard/*` cluster, whose only route (`/dashboard`) redirects to
`/` — worth its own look.

**Smoke:** SHELL-43 (twelve URLs, six of them sub-paths).

---

## S-4d — shell-v1: what died, and what is holding it up · `<commit>`

**Shell-v1 cannot be retired.** Not "not yet, pending S-3b" — it is load-bearing
for things that have nothing to do with legacy chrome, including the CURRENT
shell. The honest deliverable here is the map.

### Deleted — 8 files / 4 exports, zero callers each

| gone | evidence |
|---|---|
| `dashboardAppPageShell` | 0 callers |
| `docDaysAppPageShell` | 0 callers |
| `documentSectionsAppPageShell` | 0 callers |
| `spreadsheetAppPageShell` | 0 callers |
| `DocDaysLeftRailClient.tsx` | only caller was `docDaysAppPageShell` |
| `lib/shell/rails/` — all **6** modules | 0 consumers each, **already orphaned before this bank** |

Deleting `rails/budgetSheetSections.ts` also removes one of the four documented
`_legacy/budget` leaks in CLAUDE.md. Five importers of `_legacy/budget` remain,
down from six.

### KEPT, with reasons — this is the part that matters

**`SlideOver` — 25 importers.** It lives in `src/components/shell/`, so it looks
like shell-v1, and CLAUDE.md names it the canonical detail-panel primitive.
"Retire shell-v1" read literally deletes the slide-over every entity, every
settings panel and every budget line detail depends on. It is not going
anywhere, and the fact that it sits in the v1 folder is the real problem — a
follow-up should move it somewhere its name doesn't lie.

**`AccountAvatar` — used by the NEW shell.** `shell-v2/ProductHeaderAvatarMenu`
imports it, and that is what `ShellV3Mount` renders in the top bar. Shell-v1 is
literally inside shell-v3 right now.

**`builderAppPageShell` → `RiderPackEditorView`.** The live rider pack editor —
the one S-4b's exact-match redirect existed to protect. Two banks in a row have
now turned on that component not being disturbed.

**`listAppPageShell`** → `/budget` (no tour id), `/profile`, `/admin/ai-usage`,
`/admin/layout`. **`topBarOnlyAppPageShell`** → three `/admin` playgrounds.
**`PageShell` / `LeftRail` / `TopBar`** → `/admin/shell-playground` only.

### /admin — left alone, deliberately

Every remaining shell-v1 mount outside `/budget` and `/profile` is `/admin`.
Per instruction, and I agree: a working admin on old chrome beats a broken one
on new, and `/admin/shell-playground` is a *harness for shell-v1 itself* —
porting it to shell-v3 would delete the thing it exists to demonstrate.

### What would actually retire shell-v1

Three things, none of them S-4:
1. **S-3b** takes `/budget` (tourless), `/profile`, and the workspace/You tier
   off `listAppPageShell`.
2. **A decision on `/admin`** — port it, or accept shell-v1 as the admin chrome
   permanently and stop calling it retired.
3. **Move `SlideOver` and `AccountAvatar` out of `src/components/shell/`** so
   the folder's name matches its contents. Until then "is shell-v1 dead?" has no
   answer anyone can grep.

**Smoke:** SHELL-45.

---

## P-1 — the rail's access filter · `<commit>`

**What shipped:** `resource` on 13 rail items, `resolveVisibleResources()`
resolving an allow-list server-side, `resolveRailView()` filtering on it, and 9
tests. Money and Production covered, not just the eight ex-sub-nav items.

### It closes discoverability, NOT access

Six of the eight pages the sub-nav filtered never gated themselves — only
`personnel` and `routing` do. Those URLs were always reachable by typing them,
before this pass and after it. **P-1 does not change that and must not be
recorded as if it did.** Access is a separate audit.

### The catalogue is the constraint, and it's incomplete

Every `resource` is an id from `RESOURCE_CATALOG`. A test cross-checks all 13,
because a resource id that isn't in the catalogue **can never be granted**
through the members UI — an item gated on one would be invisible to every
readonly member forever, and on a walk it would look exactly like a permission
someone forgot to grant. That is the one failure mode a live walk is bad at
catching, so it's the one the unit tests are for.

The catalogue has **no entry** for Day sheets, Income, Settlements, Reports,
Assets, or most of the artist library. Those items are **ungated** — absent
resource means visible. Inventing ids to close the gap would be inventing a
permission model in a nav bank. Listed below for whoever owns the catalogue.

### Decisions taken

- **Fail open, everywhere.** No allow-list supplied, no membership, or a thrown
  query → `null` → nothing filtered. A nav that vanishes because a permissions
  read failed is worse than one showing too much: the user can't work and
  nothing says why. The pages and RLS do the enforcing.
- **Payroll gates on `operations.payroll`**, matching the sub-nav it restores.
  `budget.payroll` also exists and is marked *sensitive*. Two ids for one
  surface is a catalogue question, flagged not resolved.
- **Empty headings are dropped.** "Settle & pay" with nothing under it is a
  label for an absence — it tells a restricted member there's a section they
  can't see, which is the opposite of the point.
- **Disabled items are never gated** — hiding something that already does
  nothing is noise. Asserted.

### Cost

`getActiveMembership` (profiles + workspace_members) per shelled surface, and
for **readonly only**, one grants query. Admin and manager short-circuit on role
inside `canAccess`, and `fetchActiveGrants` returns `[]` without querying — so
the path most requests take adds one round-trip, not three.

### `/operations/[tourId]/summary` — KEEP, and here's the reasoning

It is the landing for a member who can read `operations.personnel` but not
`operations.routing`. Deleting it 404s exactly those users.

Now that the rail filters, the obvious alternative is to send them to the first
item they *can* see. I did not do it: it's a behaviour change for a population
of users nobody has ever observed, and the walk below is what produces the
evidence to choose. Landing them on a surface that renders is the conservative
answer until someone has actually been that user.

### THE ACCEPTANCE TEST IS NOT IN THIS REPO

A unit test proves the allow-list agrees with itself. Only a **real restricted
account** proves it agrees with what the server enforces. SHELL-49 is that walk,
and P-1 is not done until it's run — the code is green, the claim is not yet
verified.

**The reason this class kept hiding:** every verification so far has been run
from an admin session, where `canAccess` returns true unconditionally and this
filter is a no-op by construction. An admin session **cannot** see this class of
bug. That's why two "dead code" findings in S-4 turned out to be permission-
scoped.

**For the catalogue owner — rail items with no grantable resource:**
Day sheets · Income · Settlements · Reports & workbook · Assets · Riders & specs
(artist) · Documents (artist) · every workspace and You item.

**Smoke:** SHELL-49 (restricted account), SHELL-50 (admin unchanged).

---

## F-1 — hygiene: the folder that lies · `<commit>`

Lint 447 → **442** problems. Nine files deleted, two moved, 28 imports rewritten.

### 1. `src/components/shell/` now contains only shell-v1 (the priority)

`SlideOver` → `@/components/ui/SlideOver` (26 callers). `AccountAvatar` →
`@/components/ui/AccountAvatar` (rendered by shell-v2's avatar menu, which
**shell-v3** mounts).

**Not re-exported from the old barrel.** An alias would have made the move
invisible and preserved the exact ambiguity it exists to remove. 28 imports
rewritten instead; `grep components/shell/SlideOver` returns 0.

What's left in the folder is genuinely shell-v1: `PageShell`, `LeftRail`,
`TopBar`, `ShellTopBarClient`, `app-page-shells`. **"Is shell-v1 dead?" is now a
grep-able question** — which it wasn't when the answer included the app's
detail-panel primitive and the current shell's avatar.

### 2. I GOT S-4c WRONG — `TourCard` was a false positive

S-4c kept five components in `src/components/tours/` on evidence that
`TourCard` had importers. It doesn't, and never did. My grep matched
**`DashboardTourCard`** — a substring hit on a different component's name.

Exactly the trap that nearly took `SlideOver` out, and the same one that produced
two `TourOverviewClient` files. So the check is now written down in CLAUDE.md:
**grep the exact import path, not the component name.** Re-ran all five that
way; the other four are genuinely live.

Deleting `TourCard` also removed 3 `/tours` links for free.

### 3. Orphans deleted — 7 files, each 0 refs by exact-path grep

`tour-overview/TourOverviewClient` · `tours/TourCard` ·
`dashboard/{TourList, TourCard, AdvanceNeeds, Highlights, Upcoming}`.

`DashboardTourList` and `DashboardTourCard` were a **mutual-orphan pair** —
each other's only importer, which reads as "1 reference" until you follow it.

**KEPT: `DashboardArtistGate`.** Its importer chain is
`ShellTopBarClient` → `app-page-shells` → every shell-v1 surface. Live, and the
only dashboard component that is.

### 4. `/tours` link hops — 2 of 3 named files, and the real count is 32

`SetupStatusStrip` **was already deleted in S-4c**. `TourCard` is deleted here.
`TourSlideOver`'s three links are repointed: `/tours/[id]` and
`/tours/[id]/overview` → `/operations/[id]/routing`, `/tours/[id]/personnel` →
`/operations/[id]/personnel`.

**The remaining count is 32 sites, not the three I logged.** My S-4c note came
from the head of a grep and undercounted badly. They span ⌘K search providers,
the mobile redirect map, `ArtistTourScopeGuard`, `AppTopBarBreadcrumb`,
`ManageTourSegmentNav`, budget, personnel, artists and `_legacy/budget`.

All 32 **work** — the redirects catch them, at one hop per click. Repointing
them touches mobile redirects and ⌘K navigation, which is behaviour with real
regression surface, so it wants its own bank and its own walk. Not smuggled in
here.

**Checked, not changed:** `TourSlideOver` also links `/budget?tour_id=…`. That
one is **not** a dead end — `/budget/page.tsx` reads `tour_id` and redirects to
`/budget/[id]`. Verified before touching it; the S-4a lesson was that half the
"broken" links weren't.

### 5. CLAUDE.md — shell-v1 is SCOPED TO ADMIN

Retirement recorded as **closed**, not pending, with the reason:
`/admin/shell-playground` exists to demonstrate shell-v1, so porting it deletes
the thing it documents. Plus the exact-import-path rule, and both moved
components named so nobody goes looking for them in the old folder.

**Smoke:** SHELL-52 … SHELL-54.

---

## Queued, not started

In order. Nothing proceeds until **SHELL-49** (the readonly-account walk)
reports — P-1 is code-green but unverified.

1. **SHELL-49 — P-1's acceptance test.** With Adam. A readonly member granted
   `operations.routing` + `operations.personnel` only, checking that Money mode
   shows **no Payroll item**, plus the grant/revoke round-trip on Rooming.
   *Cannot be run from an admin session — `canAccess` returns true
   unconditionally, so the filter is a no-op by construction.*

2. **The 32-site `/tours` repoint.** Own bank, own walk. They all work today via
   redirect at one hop; repointing touches the ⌘K search providers and the
   mobile redirect map, which is real regression surface and does not belong
   inside a cleanup.

3. **RESOURCE_CATALOG gaps + the payroll duplicate.** Adam's permission-model
   calls, not nav work: no catalogue entry exists for Day sheets, Income,
   Settlements, Reports, Assets or most of the artist library, and
   `budget.payroll` / `operations.payroll` both exist for one surface. The
   question behind all of it is what a crew member should see.

4. **Personnel roster load — observed 2026-08, not investigated.**
   `/operations/[tourId]/personnel` shows "Loading personnel…" for **15–20s**
   while the **server-rendered rates mirror paints instantly beside it**. That
   side-by-side is the finding: same page, same data era, one path fast and one
   slow, so it isn't the network or the tour size.

   F-3(b) fixed the *server* chain; the roster is still a client fetch. Two
   candidates, and they are not exclusive: F-3(a)'s skeleton work (so the wait
   is legible), and moving the roster to the server load that the mirror
   already proves works. Worth measuring before choosing — a skeleton on a 20s
   wait is lipstick if the fetch didn't need to be client-side at all.

**Parked for Adam**
- **Screenshots** at 1440/1920 of all four scopes — the app is auth-gated and I
  have no session, so I can't produce them. The mock is verified against the
  spec and the cold-URL contract is test-pinned; the visual pass needs Cowork.
- `/assets` vs `/equipment` — **not decided**. Both resolve to the same rail item
  under the new shell; the rename is Adam's call.
