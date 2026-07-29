# Smoke tests — the canonical shell (S-1 → S-5)

Format per `docs/smoke-tests/README.md`. IDs are stable; add new ones as banks land.

**As of `431f316`, the shell is mounted on ONE page: `/operations/[tourId]/routing`.**
Everything else is still on old chrome, and that is correct until S-2.

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

- [ ] **SHELL-12 — Screenshots** at **1440** and **1920**, for the record:
  Routing with the shell, expanded rail; Routing with the rail collapsed.
  *(The other three scopes aren't migrated yet — their screenshots belong to
  S-3a/S-3b.)*

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
