# Smoke tests — the canonical shell (S-1 → S-5)

Format per `docs/smoke-tests/README.md`. IDs are stable; add new ones as banks land.

**As of S-2c, TOUR SCOPE IS COMPLETE** — every URL under `/operations/…`,
`/budget/…` and `/advance/…` renders the canonical shell. Artist, workspace and
You scope are still on old chrome; that is S-3a and S-3b.

The authoritative answer is `isShelledPath()` in `src/lib/nav/ia.ts`; the list
above is a description of it, not a second source of truth.

Grab a tour id from any tour URL you already have open and substitute it for
`[tourId]` below.

---

## Still to do — S-1 (nobody has checked these)

- [ ] **SHELL-05 — Collapse persists across a reload.** On Routing, click
  **Collapse** at the bottom of the rail → it shrinks to icons. **Reload.** Still
  collapsed. Expand it. **Reload.** Still expanded.
  *Why it matters: the preference is per-user in localStorage; if it doesn't
  survive a reload it isn't a preference, it's a toggle.*

- [ ] **SHELL-06 — Collapsed icons are identifiable.** With the rail collapsed,
  hover each icon → a tooltip names it (Routing, Day sheets, Advance, Crew,
  Rooming, Travel, Files).
  *A 52px icon strip with no tooltips is a guessing game.*

- [ ] **SHELL-07 — Unbuilt pages read as gaps, not as bugs.** **Travel** appears
  in the rail, dimmed, not clickable, and hovering says "Travel — no page yet".
  *IA_CANONICAL's point: these are missing pages, not missing nav.*

- [ ] **SHELL-08 — The back button walks scope changes.** From Routing: click
  **Money** (lands on Budget summary, old chrome), then **browser Back**. You are
  on Routing with the shell, Tour mode active, rail intact.

- [ ] **SHELL-09 — The ↑ link goes up a level.** Top of the rail shows
  **↑ Artist**. Click it → the artist page (old chrome for now — that's S-3a).

- [ ] **SHELL-10 — Deep link, cold.** Open a **new private window**, log in, and
  paste `/operations/[tourId]/routing` directly. Artist and tour are populated in
  the top bar — no "Pick an artist…" left sitting there, no blank.
  *Known cosmetic issue: the picker may flash "Pick an artist…" for one frame
  before settling. That's logged and fixed in S-2a. What this test is checking is
  that it RESOLVES, not that the flash is gone.*

- [ ] **SHELL-11 — Nothing else regressed.** Load each of these and confirm the
  page renders with its OLD chrome and no error boundary:
  `/budget/[tourId]` · `/operations/[tourId]/personnel` ·
  `/operations/[tourId]/day` · `/operations/[tourId]/rooming` ·
  `/advance/[tourId]` · `/artists` · `/venues` · `/settings`

- [ ] **SHELL-13 — A click is acknowledged before the page arrives.** On Routing,
  click **Crew** in the rail. *Immediately* — before the new page paints — the row
  takes the orange active marker and its icon becomes a spinner. Same for the
  **Money** pill (it tints and its icon spins) and for **↑ Artist**.
  *Why it matters: a route change can take a second on a cold lambda, and for
  that second an app that heard the click looks exactly like one that didn't —
  so people click again.*
  *Note: on a warm, prefetched route the page can arrive in well under a frame,
  so you may see nothing. That's correct. To see it, hard-reload first, or click
  a mode you haven't visited this session.*

- [ ] **SHELL-12 — Screenshots** at **1440** and **1920**, for the record:
  Routing with the shell, expanded rail; Routing with the rail collapsed.
  *(The other three scopes aren't migrated yet — their screenshots belong to
  S-3a/S-3b.)*

---

## Still to do — S-2a (Tour mode)

- [ ] **SHELL-14 — Every Tour-mode surface renders with the new shell.** Load
  each and confirm the page body appears with the top bar + left rail, no error
  boundary, and the RIGHT rail item lit:
  `/operations/[tourId]/routing` (Routing) · `/operations/[tourId]/day` (Day
  sheets) · `/operations/[tourId]/personnel` (Crew) ·
  `/operations/[tourId]/rooming` (Rooming) · `/operations/[tourId]/files`
  (Files) · `/advance/[tourId]` (Advance).
  *This is the bank. If one of these 500s it's the same RSC class as S-1 —
  see "If something is broken" below.*

- [ ] **SHELL-15 — The old chrome is GONE on those pages, not doubled.** No
  two-bar product nav, no Operations sub-nav strip, no artist/tour identity
  band above the content. One nav, not two.

- [ ] **SHELL-16 — The day rail and the app rail coexist.** On
  `/operations/[tourId]/rooming` and on a day page
  (`/operations/[tourId]/day/[routingId]`), the app rail starts **collapsed**
  and the day rail keeps its full width. On **Routing**, the app rail starts
  **expanded** — Routing has no day rail.
  *This is the correction from your first walk: S-1 collapsed it on Routing,
  which was my mistake.*

- [ ] **SHELL-17 — The picker no longer flashes.** Hard-reload
  `/operations/[tourId]/rooming`. The artist and tour names are in the top bar
  **in the first paint** — no "Pick an artist…" beat.
  *The layout knew the artist server-side all along; it was waiting for a client
  effect to tell it.*

- [ ] **SHELL-18 — Resume still knows where you were.** Open
  `/operations/[tourId]/rooming`, go to `/artists`, and use the Resume / pick-up
  card for that tour. It should return you to Operations, not Budget.
  *ProductShell used to record this; the new shell has to keep doing it.*

- [ ] ~~**SHELL-19 — Production is untouched.**~~ **Retired at S-2c** — nothing
  tour-scoped is on old chrome any more, so there is no boundary left inside the
  tour to check. The boundary is now tour-vs-artist, covered by SHELL-27.

---

## Still to do — S-2b (Money mode)

- [ ] **SHELL-20 — Money mode renders, and the pill agrees.** Load
  `/budget/[tourId]?tab=summary` · `?tab=budget` · `?tab=income` ·
  `?tab=receipts` · `?tab=settings`, then `/budget/[tourId]/settlement` and
  `/operations/[tourId]/payroll`. Each shows the shell with the **MONEY** pill
  lit and the matching rail item active — including Payroll, which lives at an
  `/operations/…` URL but belongs to Money.

- [ ] **SHELL-21 — The budget tabs are in ONE place now.** On any budget tab,
  the old Summary/Expenses/Income/Receipts/Settings strip is **gone** from the
  band; the rail carries them. The band keeps the **version selector**, the
  **density toggle** and **Export** — check all three are still there and still
  work.

- [ ] **SHELL-22 — The Receipts count survived the move.** With at least one
  receipt missing fields, the rail's **Receipts** item shows the count. Fix the
  last one and the number **disappears entirely** — it should not sit at "0".
  *That badge used to live on the tab band. It's the one number on that bar
  anyone acts on, so it had to move rather than quietly vanish.*

- [ ] **SHELL-23 — Money still adds up.** On `/budget/[tourId]` confirm the
  grid, burn bar and totals read the same as before the chrome changed, and that
  `/budget/[tourId]/settlement` still opens and totals.
  *Chrome-only bank — if a number moved, that's the finding.*

---

## Still to do — the S-2b fixpack + S-2c (Production)

- [ ] **SHELL-24 — Rooming keeps its rail expanded.** Load
  `/operations/[tourId]/rooming`. The app rail is **expanded** on arrival, in
  all three views (Matrix / Cards / Nights).
  *Your finding: only Cards renders a day rail, and the view defaults to Matrix,
  so collapsing here was wrong on every arrival. In Cards you now get two rails
  — collapse it once and the choice persists.*

- [ ] **SHELL-25 — Labor calls lights Day sheets.** Open a labor call
  (`/operations/[tourId]/labor`). The rail highlights **Day sheets**, its
  parent. Nothing lit at all reads as broken.

- [ ] **SHELL-26 — Production mode renders.** `/operations/[tourId]/hire`
  (Assets) · `/channel-list` · `/stage-plot` · `/riders` · a rider pack
  (`/riders/[id]`). Shell present, **PRODUCTION** pill lit, right rail item
  active, no old two-bar nav.
  On the **rider pack** specifically: it has its own 280px sidebar, so the app
  rail should start **collapsed** there — and only there, not on the pack list.

- [ ] **SHELL-27 — The boundary moved up a level.** `/artists` ·
  `/artists/[id]` · `/venues` · `/settings` still render their OLD chrome with
  no error. That's the S-3 line now; nothing tour-scoped is left behind it.

- [ ] **SHELL-28 — "Reports & workbook", not "Settings".** The Money rail's last
  Plan-side item reads **Reports & workbook** and lands on the same page the old
  Settings tab did. The URL is still `?tab=settings` — bookmarks intact.

---

## Still to do — S-2d (retire the old tour chrome)

- [ ] **SHELL-29 — The tour still works with the old chrome deleted.** Walk one
  surface per mode and confirm no error boundary:
  `/operations/[tourId]/routing` · `/operations/[tourId]/payroll` ·
  `/budget/[tourId]` · `/advance/[tourId]` · `/operations/[tourId]/channel-list`.
  *Three layouts lost a whole branch; this is the "did anything depend on it"
  check.*

- [ ] **SHELL-30 — The ARTIST and workspace tiers are untouched.**
  `/artists/[id]` · `/artists/[id]/riders` · `/artists/[id]/edit` · `/settings` ·
  `/settings/members` · `/venues` · `/bugs` · `/operations` (no tour id) ·
  `/budget` (no tour id). All still on the two-bar chrome, all still render.
  *These share `ProductShell` with the tour layouts, so this is the test that
  says the deletion stopped where it should have.*

- [ ] **SHELL-31 — Patch is gone from the rail, and still works.** The
  Production rail no longer lists **Patch**. Open
  `/operations/[tourId]/channel-list` and hit the **PATCH** toggle — the patch
  matrix still opens.
  *It was never a page; greying it claimed working software was missing.*

---

## Already verified on `431f316` (Cowork, no need to repeat)

- **SHELL-01 — The shell renders on Routing.** Top bar: workspace · artist/tour
  picker · TOUR/MONEY/PRODUCTION pill · avatar. Left rail grouped THE RUN /
  PEOPLE & LOGISTICS.
- **SHELL-02 — Tour mode active, Routing item active** on cold load.
- **SHELL-03 — The identity band is gone on Routing** (the top bar carries
  artist + tour; showing both would state it twice).
- **SHELL-04 — The routing ledger still works** underneath the new chrome.
- **Money pill → `/budget/[id]?tab=summary`** renders on its old chrome, which is
  correct until S-2b.

---

## Known and logged — don't file these again

- **The rail defaults to collapsed on Routing** even though no day rail competes
  for width there. My error: `RoutingRail` is rendered by Rooming, Day and
  Advance, *not* by the routing page. Fixed in S-2a.
- **The picker flashes "Pick an artist…"** for one frame on cold load. The layout
  knows the artist server-side; threading it through is S-2a.
- **`/assets` vs `/equipment`** — both work, both light the same rail item. The
  rename is Adam's call, deliberately not decided.

---

## If something is broken

The failure mode that bit S-1 was an **RSC boundary** error: "Something went
wrong" from the error boundary, with the page never rendering. If you see that:

1. Note which pages fail and which don't. If *only* migrated pages fail, it's in
   the shell; if *everything* fails, suspect the middleware.
2. Grab the digest numbers from the response — they map to a real stack in the
   Vercel runtime logs (Deployment → Functions, filter by digest).
3. The usual cause is a **function** being passed from a server component to a
   client component. `tsc`, `eslint`, `next build` and the jsdom tests all pass
   on that mistake, so the live page is the only thing that catches it.
