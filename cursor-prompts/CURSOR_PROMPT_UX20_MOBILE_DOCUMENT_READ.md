# UX20 — Mobile Document Read

> Final prompt of the overhaul cycle. Read-only mobile views of Advance + show files + deal memos. No editing. The "consume on the road" flow.

---

## 0. Context for Cursor

Read first:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — section 6.2 (mobile document read).
2. UX17 — Advance pages on DocumentCanvas (desktop).
3. UX18 — PWA shell + offline.
4. UX02–UX19 (must be merged).

---

## 1. Why this prompt exists

The user explicitly identified document reading on the road as the second mobile flow (alongside receipt capture). Specifically: advance for the current/next show + contracts + received files. Read-only. Large readable type. Optimised for one-handed use.

---

## 2. Hard rules

1. **One mobile route hierarchy**: `/m/...` for mobile-optimised pages.
2. **Read-only**. No editing UI surfaces here. Fields render as static prose.
3. **Large readable type**: minimum 16px body, 1.65 line-height (use `--lp-text-base` × 1.14 or just lock to 16px on `/m/`).
4. **Single-column layout** with generous padding.
5. **Cached for offline** — pages visited at least once are available offline via the service worker (UX18 already enables this for static shell; here we ensure dynamic content also caches as the user views it).
6. **Auto-detect "current show"** — landing route `/m/today` shows today's (or next upcoming) show's advance.
7. **No new dependencies.**
8. Lint + typecheck clean.

---

## 3. Pages in scope

| Route | Content | Notes |
|-------|---------|-------|
| `/m/today` | Auto-detect current/next show, redirect to `/m/show/[id]` | Smart landing |
| `/m/show/[id]` | Show summary + advance sections + linked files | Main read view |
| `/m/show/[id]/file/[fileId]` | File reader (PDF inline, image inline, fallback download) | |
| `/m/files` | List of all files for current tour, searchable | |
| `/m/deal-memos` | List of deal memos for current tour | |

---

## 4. Step 1 — `/m/today` smart landing

Logic:
1. Get user's active tour (most-recent-edited or last-visited)
2. Find today's show (date matches today)
3. If found, redirect to `/m/show/[id]`
4. Else find next upcoming show; redirect there
5. Else show a tour picker

---

## 5. Step 2 — `/m/show/[id]`

### 5.1 Layout

Top bar (mobile): back arrow, show name + city (truncated), a small "..." menu (jump to: Files / Deal Memos / Today's calendar).

Body: scrolling sections, each rendered as a collapsible card:
- **Quick info** — date, day type pill, city, venue, doors, set times (large type)
- **Travel** — flights (no chip; render as plain text "BA 1234 LHR→JFK · 09:00")
- **Hotel** — name, address, phone, check-in/out, confirmation #
- **Venue** — address + small embedded map (use Leaflet — already a dep — or a static map image; pick static if simpler)
- **Schedule** — minute-by-minute day schedule
- **Tech** — link to Channel List PDF (download button), link to stage plot image
- **Catering** — meal times, dietary notes
- **Settlement** — read-only fields
- **Files** — count of files for this show with "View all" link

Each section uses an accordion: tap header to collapse/expand. All open by default.

### 5.2 Visual

- Background `--lp-bg`
- Section cards: `--lp-surface`, `--lp-radius-lg`, `--lp-shadow-sm`, padding `--lp-space-4`
- Type: 16px body, 18px section headings, 14px secondary
- Brand orange used sparingly (links, today indicator)

### 5.3 Caching

When user views a show, fetch its full data (advance + files metadata) and store in localStorage / IndexedDB so subsequent visits while offline still work. Cache per-show, expires after 7 days (refresh on access if online).

---

## 6. Step 3 — `/m/show/[id]/file/[fileId]`

File reader. Behaviour by file type:
- **PDF**: render inline using browser's native PDF viewer (`<embed type="application/pdf">` or iframe). Fallback: download button.
- **Image**: full-width inline, pinch-to-zoom enabled.
- **Other** (docx, xlsx, etc): show metadata + download button. Don't try to render in-page.

Top bar: back arrow + filename + share icon (uses Web Share API on mobile to send the file's link, not the file itself).

For offline support: cache the file blob in IndexedDB on first view (size cap — 50MB per file; refuse if larger).

---

## 7. Step 4 — `/m/files`

Mobile-optimised file list. Use `<DataTable>` with the `compact` density and only essential columns (Name, Type, Tag). Search box prominent at top. Tap row → navigate to file reader.

If a file is cached for offline, show a small dot/badge indicator.

---

## 8. Step 5 — `/m/deal-memos`

Same shape as `/m/files`, filtered to deal memo records. Tap → file reader (deal memos are typically PDFs).

---

## 9. Step 6 — Mobile detection + routing guards

Add a hook `useIsMobile()` that returns true if `window.innerWidth < 768`.

If a desktop user navigates to `/m/...` directly, redirect them to the desktop equivalent (e.g. `/m/show/[id]` → `/tours/[tourId]/advance/[showId]`).

If a mobile user navigates to a heavy desktop page (e.g. `/tours/[id]/budget`), show a small banner: "Best viewed on desktop. Continue?" with options to proceed or to go to `/m/today`.

---

## 10. Step 7 — Optional: bottom tab bar

Mobile UX standard: bottom tabs for primary navigation. Build a small `<MobileTabBar>` component:
- Today (`/m/today`)
- Files (`/m/files`)
- Receipt (`/m/receipt` — UX19)
- Account

Show on every `/m/...` page. Doesn't replace the per-page top bar; sits below.

---

## 11. Verification

1. Lint + typecheck clean
2. Mobile DevTools view: `/m/today` redirects correctly
3. Show page renders all sections; type is readable at arm's length
4. Files load and PDFs render inline
5. Offline: previously-viewed shows still load
6. Large PDFs (10+ pages) render acceptably
7. Tab bar nav works
8. Desktop redirect works when desktop user hits `/m/`
9. PWA-installed Lowpass loads `/m/today` as start URL on mobile
10. Lighthouse mobile audit scores ≥ 90 on `/m/show/[id]`

---

## 12. Acceptance criteria

- [ ] All 5 mobile routes work
- [ ] Read-only enforced (no edit affordances)
- [ ] Per-show caching for offline
- [ ] File reader handles PDF / image / other
- [ ] Mobile tab bar + desktop redirects
- [ ] Lint + typecheck clean
- [ ] No new deps

---

## 13. Out of scope

- ❌ Don't add edit-on-mobile flows for advance (defer indefinitely; user explicitly said no)
- ❌ Don't add real-time collaboration UI on mobile
- ❌ Don't add notifications (defer)
- ❌ Don't redesign Advance content or sections — UX17 owns that

---

## 14. Commit plan

Three commits:
1. `UX20: mobile show read view + smart /m/today landing`
2. `UX20: mobile file reader + caching`
3. `UX20: mobile files/deal-memos lists + tab bar + desktop redirects`

---

## 15. End of overhaul cycle

After UX20 lands, the overhaul is complete. Run through the **Definition of done** checklist in the roadmap (section 11):

1. Every page renders inside `<PageShell>` with the correct archetype
2. No bespoke table / panel / grid implementations remain
3. Flight / Person / Room / Gear are canonical entities edited from multiple views
4. Budget rebuild matches/beats the user's existing spreadsheets for entry speed
5. Mobile receipt + read flows work as PWA
6. New page added by Cursor without explicit visual brief still feels native

Schedule a final QA pass with the user to verify each item.
