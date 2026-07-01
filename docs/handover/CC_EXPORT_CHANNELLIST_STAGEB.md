# CC — Export: **Channel List** surface (5th). Stage B: GO. Branch off `main` (after the v2.1 batch lands).

Add the channel/input list as a **5th export surface** in the unified export system — same pattern as
rooming/routing/payroll. It's tabular, so it drops straight in. **Branch off `main` once the Export v2.1
batch is merged** (you need the latest shell + the reworked xlsx + the v2.1 editor); if v2.1 isn't merged,
branch off its tip `feat/export-v21-rooming`. Branch `feat/export-channel-list`.

## Build (the established per-surface pattern)
1. **`loadChannelListExportData(tourId)`** — mirror the channel-list page's loaders: `channel_list_rows`
   (channel #, instrument/source, mic/DI, stand, phantom, notes), the outputs (mix/IEM) +
   `stage_boxes`/stage-IO positions (migrations 040/043/046/098/115). Read-only, workspace-RLS.
2. **`buildChannelListBodyHtml(data, config)`** — a clean branded **input-list table**: channel · source ·
   mic/DI · stand · phantom · (output/mix col if present) · notes. Config drives section visibility/order +
   the styling (reuse the shared shell + the v2 styling controls). Numbers/flags render cleanly.
3. **Routes** — `POST /api/channel-list/[tourId]/export/pdf` + `…/preview` + wire it into the shared
   `/api/export/xlsx` (add `'channel-list'` to the surface set). Same guard / RFC-5987 filename / RLS as the
   others.
4. **xlsx** — channel list is the surface that MOST benefits from a clean Excel (engineers reuse it): a
   tidy grid (one row per channel, real columns), using the v2.1 xlsx improvements (widths, header styling,
   freeze/filter).
5. **`ExportSurface`** union + `CHANNEL_LIST_SECTION_IDS` + `DEFAULT_CHANNEL_LIST_CONFIG` (byte-for-byte =
   a sensible default table) + `normalizeConfig` branch. **The "Export…" button** on the channel-list page
   (the shared orange `ExportButton`).

## Hard rules
- **Branch off `main` after v2.1 merges. Commit + PUSH. Confirm `git log origin/<branch>`.**
- Same invariants: presentation-only; DEFAULT config = a clean default; shared shell generic; read-only +
  workspace-RLS; tokens; `tsc`/`eslint`/`build` green. No migration (config in jsonb).
- **Verify before claiming** — name files/lines; push the hash. The table content matching the channel-list
  page + the Excel being clean are yours; Adam eyeballs the visual.
- Smoke `EXP-CHAN-01..` in `budget.md`.
