# CC — S-1: the canonical shell. Build it, prove it on ONE page, migrate nothing else. SINGLE OWNER.

Adam's ruling: the shell in `docs/design/SHELL_CANONICAL_MOCK_2026-07-21.html` carries **every single page**. Mode names **confirmed: Tour · Money · Production**. The full page→home assignment is `docs/design/IA_CANONICAL_2026-07-21.md` — that document is the source of truth for what goes where; this one is how to build it.

**Open the mock in a browser before writing code.** It is clickable: the modes slide, the rail swaps per scope, the artist name goes up a level, Collapse works everywhere. Build that behaviour.

## The rule that makes it coherent
**Four scopes; the mode pill exists ONLY at tour scope.**

| Scope | Entered by | Rail |
|---|---|---|
| Workspace | logo / workspace name | Artists · Personnel pool · Equipment & rentals · Venues |
| Artist | clicking the artist name | Overview · Tours · Year budget · People · Riders & specs · Brand & logos · Documents · Contacts |
| Tour | picking a tour | the three modes |
| You | avatar (top-right) | Account · Preferences · Team & roles · Billing · Report a bug |

Tour modes and their rail groups are enumerated in IA_CANONICAL §"The model". Transcribe them exactly — including that **Payroll moves from Operations into Money**, and **Labor calls is NOT a top-level rail item** (it's reached from Day sheets → Schedule, carrying its call-count badge).

## S-1 scope — chrome only. NO page migrations.
This bank builds the shell and proves it on **Routing alone**. Every other page keeps its current chrome until S-2. Resist the urge to migrate more; a half-migrated app is the failure mode.

1. **`src/lib/nav/ia.ts` — ONE config module.** Scopes, modes, rail groups, items, icons, hrefs, badge sources. Pure data + pure resolvers (`resolveScope(pathname)`, `railFor(scope, mode)`, `modeForPath(pathname)`). No component imports it twice; no nav strings live in components. This module is the thing that makes S-2..S-5 mechanical.
2. **`<AppShellV3>`** — top bar (workspace · artist · tour · mode pill · avatar) + `<NavRail>` + content slot. Server component where possible; the rail's collapsed state is client.
3. **Deep-link correctness is the hard requirement.** Landing cold on ANY url sets the right scope, mode, and active rail item — derived from the pathname, never from client state. This is the P0-context lesson: the shell must not depend on ambient selection. A cold load of `/budget/[tourId]/settlement` shows Money mode with Settlements active, artist and tour populated, with no prior interaction.
4. **Rail collapse** persists per user (localStorage), collapses to 52px icons-only, and works at every scope. Tooltips on hover when collapsed.
5. **Mount on Routing only**, behind the existing chrome's removal for that route alone. Everything else untouched and still working.

## Interaction with work already shipped — read this before you design
- **The spine (R5) already exists.** `<RoutingRail>` is the shared day rail used by Advance, Day and Rooming. **The nav rail and the routing rail are DIFFERENT things** — one navigates the app, one navigates days within a tour. Do not merge them and do not let S-1 break the collapse-to-rail transition. State in the report how the two coexist visually at 1440 (my expectation: nav rail collapses to icons when a day rail is present, or the day rail becomes a second column — decide, justify, screenshot).
- **The identity band (G2-4)** currently renders artist·tour·status under the top bar. The new top bar carries artist and tour. **Retire the band on migrated pages** rather than showing the same facts twice — but only on Routing in this bank.
- **`ProductHeader` / two-bar nav / `OperationsGroupSubNav`** get deleted in S-2, not now. S-1 leaves them alive for unmigrated pages.

## Verification (Cowork walks this)
Cold-load, no prior clicks, all at 1440 and 1920:
- `/operations/[tourId]/routing` → Tour mode active, Routing item active, artist+tour populated, no "Pick an artist…".
- Click Money → lands on Budget summary; Production → Assets; both with the right rail.
- Click the artist name → artist scope, pill gone, artist rail.
- Workspace name → workspace scope. Avatar → You scope.
- Collapse, reload, still collapsed. Expand, reload, still expanded.
- Back button walks the scope changes correctly.
- Every other product still renders its old chrome without regression.

## Gates
Floor green · money paths untouched · **`ia.ts` has unit tests** for `resolveScope`/`modeForPath` across every URL shape in IA_CANONICAL (this is the module S-2..S-5 lean on; a wrong resolver silently mis-highlights the whole app) · screenshots at 1440+1920 of all four scopes · raw git evidence + Vercel success. Report which pages still use old chrome so S-2's scope is explicit.
