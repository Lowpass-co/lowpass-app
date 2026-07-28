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

**Still on old chrome:** everything except Routing. See the S-2 entries below as
they land.

**Parked for Adam**
- **Screenshots** at 1440/1920 of all four scopes — the app is auth-gated and I
  have no session, so I can't produce them. The mock is verified against the
  spec and the cold-URL contract is test-pinned; the visual pass needs Cowork.
- `/assets` vs `/equipment` — **not decided**. Both resolve to the same rail item
  under the new shell; the rename is Adam's call.
