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

**Parked for Adam**
- **Screenshots** at 1440/1920 of all four scopes — the app is auth-gated and I
  have no session, so I can't produce them. The mock is verified against the
  spec and the cold-URL contract is test-pinned; the visual pass needs Cowork.
- `/assets` vs `/equipment` — **not decided**. Both resolve to the same rail item
  under the new shell; the rename is Adam's call.
