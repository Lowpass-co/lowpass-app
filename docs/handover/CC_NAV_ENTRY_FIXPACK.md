# CC — Nav & entry fixpack (P2). New users stop getting lost. SINGLE OWNER.

Precondition: consolidation done, `main`, floor green. Adam has answered Decisions 4-5 in `AUDIT_2026-07-03.md`. Gates per item: `tsc` 0 · `eslint` 0 · `next build --webpack` green. Commit per item.

## 1. Tour-card click stops hardwiring Budget  [needs Decision 4]
`src/components/artists/TourPicker.tsx:90-93`: `openTour()` → `/budget/${id}` unconditionally. Default recommendation: remember last-visited product per tour (localStorage `lp:lastProduct:<tourId>`, written by ProductShell on mount), fall back to `/operations/${id}` for never-visited tours. Whatever Adam picks: the card should also expose the three products directly (small Operations/Budget/Advance affordances on hover or a caret) so the default is a shortcut, not a wall.

## 2. Routing becomes discoverable from Artist Home
No visible path Artist Home → Routing today (only Operations' Bar-1 hover dropdown, `src/lib/shell/productNav.ts:98`). Add: (a) explicit Routing link on the tour card / ArtistProductCards Operations card, (b) post-tour-creation success state deep-links "Add your shows → Routing". Do not invent new chrome — use existing card/CTA patterns.

## 3. Post-login lands directly
`src/app/(auth)/login/page.tsx:78`: `router.push(nextPath ?? '/dashboard')` → double redirect through a retired URL. Change fallback to `/artists`. Keep `?next=` behavior. (If salvage item 5 — single-artist auto-skip — already landed, ensure these compose: fallback `/artists`, which itself may skip.)

## 4. Shell-v1 stragglers on live surfaces → ProductShell
- `src/app/(app)/budget/page.tsx` (product landing, `listAppPageShell`) → `<ProductShell active="budget">`, match `/operations` + `/advance` landing structure.
- `src/app/(app)/artists/[id]/edit/page.tsx` (`listAppPageShell`, linked from `ArtistsList.tsx:66`, `ArtistPageHeader.tsx:19`) → FIRST check whether `ArtistEditSlideOver` already covers this surface; if yes, retire the page and point the two links at the slide-over; if no, wrap in `<ProductShell active="home">`.
Do NOT attempt the other 26 PageShell importers (Phase-4 scope) — list them in the report untouched.

## 5. Orphans and stubs
- `/gear` (`src/app/(app)/gear/page.tsx`, shell-v1, zero inbound links): per Decision 5 — delete, or add to nav. If deleting, confirm the Equipment workspace tab covers its functionality first (name what `/gear` shows that Equipment doesn't, if anything).
- `/settings/ai-limits`: add link from `/settings` page (and avatar menu only if Adam wants it surfaced).
- `/tours` bare list page: add `next.config.ts` redirect → `/artists` (all other legacy tour URLs already redirect; this is the one gap).
- `/admin/ai-usage`: remove the inner `<ProductShell>` — it double-wraps inside `admin/layout.tsx`'s `listAppPageShell`.
- Dev sandboxes (`/grid-demo`, `/admin/*-playground`, `/stage-plot-*` top-level routes): gate behind the site-admin check (`getUserAndAdminStatus()`, mirror `bugs/page.tsx`) or delete — ask Adam per route in the report, don't guess.

## 6. Smoke tests
Add NAV-* smoke IDs to `docs/smoke-tests/` covering: login→landing click-count, tour-card→product, artist-home→routing path. Same PR.

## Out of scope — flag, don't fix
Porting `/tours/[id]/*` legacy pages (Phase 4), mobile `/m/*` discoverability (pending separate UI session), onboarding/tutorial content.

## Verify before claiming (hard rule)
Per item: file+lines, before/after route behavior, click-path counts for the three flows in item 6. Floor-green per commit. Name anything you did NOT do.
