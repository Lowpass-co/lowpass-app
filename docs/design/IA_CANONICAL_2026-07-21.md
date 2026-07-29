# Lowpass — canonical IA + shell. Every page has a home. (2026-07-21)

Adam's ruling: the shell in `docs/design/SHELL_CANONICAL_MOCK_2026-07-21.html` carries **every single page**. Collapsible left rail, three-mode slider pill at tour scope, artist and workspace scopes above it, user scope separate. This document assigns a home to every route found in the full inventory — nothing is left un-homed, and everything that shouldn't exist is marked for deletion.

## The model

**Four scopes.** The mode pill exists ONLY at tour scope.

| Scope | Reached by | Rail shows |
|---|---|---|
| **Workspace** | logo / workspace name (top-left) | Artists · Personnel pool · Equipment & rentals · Venues |
| **Artist** | clicking the artist name | Overview · Tours · Year budget · People · Riders & specs · Brand & logos · Documents · Contacts |
| **Tour** | picking a tour | the three modes below |
| **You** | avatar (top-right) | Account · Preferences · Team & roles · Billing · Report a bug |

**Three tour modes.** (Adam's sketch said Budget · Operations · Tour; *Operations* and *Tour* overlap, so: )

| Mode | Rail groups |
|---|---|
| **TOUR** | THE RUN: Routing · Day sheets · Advance — PEOPLE & LOGISTICS: Crew · Rooming · Travel · Files |
| **MONEY** | PLAN: Summary · Expenses · Income — SETTLE & PAY: Settlements · Payroll · Per diems · Receipts — OUT: Reports & workbook |
| **PRODUCTION** | INVENTORY: Assets · Spaces & cases · Movements — THE SHOW: Channel list · Patch · Stage plot · Riders — PAPER: Manifests & carnet · Templates |

## Every route → its home

### Tour scope · TOUR mode
| Route | Rail item |
|---|---|
| `/operations/[tourId]/routing` | Routing (default landing) |
| `/operations/[tourId]/day` · `/day/[routingId]` | Day sheets |
| `/advance/[tourId]` · `/[routingId]` (+ packet, share) | Advance |
| `/operations/[tourId]/personnel` | Crew |
| `/operations/[tourId]/rooming` | Rooming |
| *(travel — no page yet)* | Travel — **placeholder; flights/ground live only inside the Day today** |
| `/operations/[tourId]/files` | Files (tour files only; the artist library is artist scope) |
| `/operations/[tourId]/labor` | **reached from Day sheets → Schedule**, not a top-level rail item (its call-count badge lives on the Day's Schedule button) |

### Tour scope · MONEY mode
| Route | Rail item |
|---|---|
| `/budget/[tourId]` (`?tab=summary`) | Summary |
| `/budget/[tourId]?tab=expenses` | Expenses |
| `/budget/[tourId]?tab=income` | Income |
| `/budget/[tourId]/settlement` | Settlements |
| `/operations/[tourId]/payroll` | Payroll — **moves out of Operations into Money** (it's pay, not ops) |
| *(per diems — currently inside payroll)* | Per diems — surface it as its own item |
| *(receipts — currently a panel)* | Receipts — becomes a first-class item when RC-1 lands |
| `/budget/[tourId]` export/import controls | Reports & workbook |

### Tour scope · PRODUCTION mode
| Route | Rail item |
|---|---|
| `/operations/[tourId]/hire` → **rename/merge** | Assets (tour view of the unified inventory) |
| *(S1 spaces UI)* | Spaces & cases |
| *(S1 movements)* | Movements |
| `/operations/[tourId]/channel-list` | Channel list |
| *(patch mode inside channel list)* | Patch |
| `/operations/[tourId]/stage-plot` | Stage plot |
| `/operations/[tourId]/riders` · `/riders/[id]` | Riders |
| *(S1 carnet/manifest exports)* | Manifests & carnet |
| *(rider/channel templates)* | Templates |

### Artist scope
| Route | Rail item |
|---|---|
| `/artists/[id]` | Overview |
| `/artists/[id]/production` | **fold into Overview or rename** — "Production" at artist scope collides with the tour mode name |
| *(new — cross-tour roll-up)* | **Year budget** — Adam's explicit ask; does not exist yet |
| *(new)* | People (artist-wide roster) |
| `/artists/[id]/riders` | Riders & specs |
| `/artists/[id]/channel-lists` · `/stage-plots` · `/stage-plots/[plotId]` | Riders & specs (grouped) |
| *(new)* | Brand & logos — logos exist in data, no page |
| `/artists/[id]/files` | Documents |
| *(new)* | Contacts |
| `/artists/[id]/edit` | Overview → Edit (not a rail item) |
| `/artists/[id]/financials` | **stub — delete or become Year budget** |

### Workspace scope
`/artists` → Artists · `/personnel` → Personnel pool · `/assets` + `/equipment` → **Equipment & rentals (pick ONE, see below)** · `/venues` → Venues

### You scope
`/settings` → Preferences · `/settings/members` → Team & roles · `/settings/ai-limits` → Preferences (sub) · `/profile` → **merge into Account** · `/bugs` → Report a bug (admin-visible)

### Keeps its own chrome — NOT the app shell
`/login` · `/signup` · `/invite/accept` · `/r/[token]` · `/a/[token]` · `/intake/[token]` · `/advance-intake/[token]` · `/m/day/[token]` · `/share/advance/[token]` · `/rental/print-labels` (print-only) · `/m/*` authed mobile (keeps MobileTabBar) · `/admin/*` (own shell, but migrate off shell-v1).

## Delete (dead weight the inventory found)
1. **The entire `/tours/[id]/*` tree** — 12 legacy pages, every one already 301'd in `next.config.ts`, still on disk, all still on shell-v1. Delete the files; keep the redirects.
2. `/gear` — orphan, no inbound link, duplicates the gear library.
3. `/operations/[tourId]/summary` — orphan leftover of the old tour root.
4. `/artists/[id]/financials` — empty stub (unless it becomes Year budget).
5. `/rooming`, `/calendar`, `/rider-packs`, `/account/rental` — redirect stubs; delete after fixing their callers.
6. Dev harnesses (`/stage-plot-*`, `/grid-demo`, `/tour-fingerprint-demo`) — keep, but they stay outside the shell and admin-gated.

## Live bugs the inventory surfaced (fix during migration)
- **`RoomingTourRedirect.tsx` and `BudgetTourSelector.tsx` push `/rooming?tour_id=…`**, which now redirects to `/artists` — a dead-end for the user. Point them at `/operations/[tourId]/rooming`.
- **Broken redirects → 404:** `/library/deal-memos/*` → `/budget/deal-memos/*` (no such route), `/library/templates/*` → `/templates/*` (no such route), `/library/gear/*` → `/account/rental/*` (no such sub-route). Remove or repoint.
- **`ArtistHeroTabs` renders a `business` tab** resolving to `/artists/[id]/business`, which has no page. Confirm it can't be clicked, or remove it.
- **`/assets` vs `/equipment`** — `AssetsClient`'s own header says it replaces the equipment inventory tab and the gear library, but `/equipment` still renders `EquipmentClient` and `WorkspaceTabs`'s matcher lights for both. **Adam decides which name survives; the other redirects.** Recommendation: keep **`/assets`** (it's the unified S1 model; "equipment" reads rental-house-only).
- **`/operations/[tourId]/hire` and `/operations/[tourId]/edit` have zero inbound links** — hire becomes Production→Assets; edit becomes a button on the tour picker/overview.

## Migration staging (do NOT rip the shell out in one bank)
- **S-0** — the P0 in `CC_P0_PUBLIC_TOKEN_ROUTES.md` lands first. Unrelated to nav, but it's a live customer-facing break.
- **S-1** — build `<AppShell v3>`: top bar (workspace · artist · tour · mode pill · avatar) + collapsible rail + scope/mode config in ONE module (`src/lib/nav/ia.ts`) that the mock's structure is transcribed into. No page migrations yet. Ship it behind the existing chrome on ONE page (routing) to prove it.
- **S-2** — migrate tour scope: all `/operations/*`, `/budget/*`, `/advance/*` onto the three modes. Payroll moves to Money. Retire `OperationsGroupSubNav` and the two-bar `ProductHeader`.
- **S-3** — artist + workspace + you scopes. Fold `/profile` into Account, resolve `/assets` vs `/equipment`.
- **S-4** — deletions above + the live-bug list + shell-v1 retirement (`/admin/*` last).
- **S-5** — the gaps this exposed as *missing pages, not missing nav*: **Year budget** (cross-tour), **Brand & logos**, **Contacts**, **Travel**. Each is now an obvious empty slot in the rail rather than a feature nobody could find — which is exactly what Adam meant by "new features clearly have a home".

Rail state (expanded/collapsed) persists per user in localStorage. Every rail item is a real URL — no modal-only destinations. Deep links keep working: landing on any URL sets the correct scope + mode.
