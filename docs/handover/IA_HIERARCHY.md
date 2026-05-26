# Two-tier IA — quick reference

Short note for future agents. The canonical hierarchy after
the IA Cleanup sprint:

```
Tier 1 — Workspace level (no tour context)
  /artists      ← workspace dashboard, Artists tab (default)
  /personnel    ← workspace dashboard, Personnel tab
  /equipment    ← workspace dashboard, Equipment tab
  /settings     ← reachable via gear icon + avatar dropdown
  /venues       ← avatar dropdown (low-traffic)
  /bugs         ← avatar dropdown (admin only)

Tier 2 — Artist context (one artist, multiple tours)
  /artists/[id]                            ← artist home
  /artists/[id]/(library)/riders           ← artist library
  /artists/[id]/(library)/channel-lists
  /artists/[id]/(library)/files
  /artists/[id]/(library)/financials

Tier 3 — Tour context (one tour, multiple shows)
  /operations/[tourId]/*    ← Operations product
  /budget/[tourId]/*        ← Budget product
  /advance/[tourId]/[routingId]
```

## Chrome rules

| Tier | Chrome | ProductRail |
|---|---|---|
| Workspace | `WorkspaceTopBar` + `WorkspaceTabs` | not rendered |
| Artist | `ProductHeader` + `ProductRail` | visible; Operations / Budget / Advance dimmed until a tour is picked |
| Tour | `ProductHeader` + `ProductRail` | fully active |
| Neutral (Settings / Venues / Bugs) | `ProductShell` with `active={null}` | visible without any highlight |

## Route-group convention

Workspace dashboard pages live under the `(workspace)` route
group at `src/app/(app)/(workspace)/`. The route group is
transparent in URLs — `/artists`, `/personnel`, `/equipment`
all resolve through it. The shared layout
(`src/app/(app)/(workspace)/layout.tsx`) mounts
`WorkspaceTopBar` + `WorkspaceTabs` so each tab inherits
the chrome.

Artist detail pages (`src/app/(app)/artists/[id]/*`) live
OUTSIDE the workspace group because they're artist-scoped,
not workspace-scoped. They render under `ProductShell`.

## "New workspace-level surface" rule

When adding a new workspace-level surface (a new dashboard
tab, or a new settings-adjacent page):

- **Workspace tab** (sibling of Artists / Personnel /
  Equipment): create `src/app/(app)/(workspace)/<name>/page.tsx`
  and add the tab entry to `WorkspaceTabs`. Layout inherits
  for free.
- **Neutral surface** (settings, admin, low-traffic): mount
  `ProductShell` with `active={null}` and a `productName`
  string. Add an entry to the avatar dropdown.

## Shell mapping

`shell-v2` (ProductShell + ProductHeader + ProductRail) is
the canonical chrome system. `shell-v1` lives at
`src/components/shell/*` and only persists on:

- `(auth)/*` — login flows
- `(share)/*` — public read-only pages
- `intake/*` — public intake form
- A few admin / mobile / legacy surfaces yet to migrate

When migrating a remaining shell-v1 surface, prefer
ProductShell with `active={null}` over re-using the
shell-v1 `listAppPageShell`.

## Gear icon

Three locations, all routing to `/settings`:
- `WorkspaceTopBar` top-right (workspace tier — via avatar menu)
- `ProductRail` bottom (artist + tour tiers; see
  `src/components/shell-v2/ProductRail.tsx:134`)
- Avatar dropdown (both shells)
