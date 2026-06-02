# Stage Plot Builder — build status (autonomous session)

Branch: **`feat/stage-plot-builder`** (pushed to origin). Build: `next build --webpack` **green**. `tsc --noEmit` + `eslint` clean.

## TL;DR — what you can test on wake

**No DB / no login needed (works immediately):**
- **`/stage-plot-editor`** — the full editor (palette · canvas · properties), backed by localStorage. Add icons from the palette, click to select, drag to move (snap-to-grid), edit in the properties panel, delete (Del) / duplicate (⌘D), toggle grid/rulers/markers, set stage size + brand colour. **Export PDF** prints client-side → Save as PDF.
- **`/stage-plot-icon-preview`** — the full 154-icon catalog (library + canvas modes).
- **`/stage-plot-canvas-preview`** — a mock band on the canvas.

(These dev routes are gated to `NODE_ENV !== 'production'` and allow-listed in `supabase-middleware.ts`.)

**After you apply migration 109** (`database/migrations/_apply_109_supabase.sql` → Supabase SQL editor):
- **`/artists/[id]/stage-plots`** — library list (create / open / delete).
- **`/artists/[id]/stage-plots/[plotId]`** — the editor, loading + autosaving to the DB.

## What's built

| Phase | Status |
|---|---|
| §SP0 data model | ✅ migration 109 + `_apply_109` + TS types |
| §SP1 icons | ✅ 154 icons, 12 categories, 3 review rounds (drums reoriented, Marshall-cab amps, traced mics, horizontal strat, real-world footprints) |
| §SP1·1 system | ✅ registry + `<StagePlotIcon>` + category tokens + `outline` mode |
| §SP2a/b/c canvas | ✅ SVG surface, pan/zoom, select, drag+snap, grid (faint+bold), rulers, cardinals, AUDIENCE, reference markers |
| §SP3 properties | ✅ label/x/y/size/rotation/tint/lock/delete + stage settings |
| §SP7 PDF | ✅ client print + server Puppeteer route (`/api/stage-plots/dev-pdf`; needs `PUPPETEER_EXECUTABLE_PATH` locally) |
| §SP0 wiring | ✅ server mappers + API (POST/GET/PUT/DELETE) + library page + editor route (needs migration 109) |

## Quiz answers honoured (Q1–Q7)
Recorded in the §SP0 commit body. Q6 (colour-blind = colour + letter badge) is in the category badge system; Q2 (drum split hybrid) + Q5 (polygon cap 20) + Q4 (festival admin gate) land with §SP9/§SP17/§SP12. Q3/Q7 still need their exact option legend confirmed at §SP4/§SP3.

## Known gaps / next
- **Apply migration 109** before testing the DB-backed flow.
- **Library nav tab** — `/artists/[id]/stage-plots` is reachable by URL + linked from the list, but isn't yet in the artist-library tab nav (couldn't locate a shared tab component; the riders/channel-lists links aren't in an obvious nav). Small follow-up.
- **Not yet built:** §SP4 channel-list linking + sub-snake tint, §SP5 derived input/power lists, §SP6 brand cascade (tours.brand_color column), §SP8 public `/p/[token]` reader, §SP9 cluster split, §SP10 custom uploads, §SP11 AI icons, §SP12 festival layer, §SP13 versions, §SP14 templates, §SP15 offline PWA, §SP16 touch, §SP17 annotations, §SP18 undo/redo.
- **Riser-blue** request (per-icon colour override) — deferred.
- PDF B&W/page-size are supported in `buildStagePlotPdfHtml` opts but not yet exposed in an export-options UI.

## Open question for you
- Electric guitar: redrawn **horizontal** per your reference. If the proportions still aren't right, mark up the shape and I'll re-trace.
