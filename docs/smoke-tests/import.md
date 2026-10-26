# AI schedule import smoke tests

> Drop a tour book / routing grid / itinerary → the AI proposes days → review,
> edit, approve → merge into the Schedule. Two entry points: the Schedule page
> (`RoutingEditor` → `<ScheduleImportModal>`) and New tour
> (`TourEditorModal` → "Start from a tour book or routing grid").
> Rules: `src/lib/import/scheduleImport.ts`. Routes: `/api/import/schedule/upload`,
> `/api/import/schedule`, `/api/tours/[id]/routing/import`. ID prefix `IMP`;
> IDs never recycled.
>
> v1 scope (Adam, Oct 2026): **days & venues only** — date, day type, venue,
> city, country, address, notes. Day times are NOT imported yet; when they are,
> they go to the show's Advance.

## Status snapshot (2026-10-26 — built, needs-live)

| ID | Result | Note |
|----|--------|------|
| IMP-01 | code-verified | Import chip + drag-anywhere overlay on the Schedule |
| IMP-02 | **needs-live** | real AI read of a text PDF tour book |
| IMP-03 | **needs-live** | real AI read of a scanned PDF / photo |
| IMP-04 | code-verified (unit) / **needs-live** | Excel grid reaches the model with ISO dates |
| IMP-05 | code-verified | review: New / Changes / Already match, keep / use new, edits |
| IMP-06 | code-verified | apply is merge-only, widens the tour, never deletes |
| IMP-07 | code-verified | closing mid-review asks first |
| IMP-08 | code-verified | New tour: imported days seed the routing tab |
| IMP-09 | code-verified | Word file refused with "save it as PDF" |
| IMP-10 | **needs-live** | 25 MB PDF uploads (signed URL to `tour-files`), read < 5 min |

Unit: `src/lib/import/scheduleImport.test.tsx`,
`src/app/api/import/schedule-import.route.test.tsx`,
`src/components/import/ScheduleImportFlow.test.tsx`.

#### IMP-01 — Entry points on the Schedule
Open a tour's Schedule. An **Import** chip sits in the toolbar. Dragging a file
anywhere over the editor shows "Drop to import with AI"; dropping it opens the
import with that file already added — press **Read with AI**. Read-only users see neither.

#### IMP-02 — Text tour book
Drop a real tour book PDF. Within ~1 min the review lists one row per date with
the right day type, venue and city; "Found N days · <tour name>" and the date
range match the book. Anything the AI was unsure of is in "Check these" or has a
**Check** chip (hover shows the text it read).

#### IMP-03 — Scanned PDF / photo
Drop a scanned tour book or a phone photo of a routing sheet. Same as IMP-02
(read from the images, not text).

#### IMP-04 — Excel routing grid
Drop an .xlsx routing grid with real date cells. Dates come through correctly
(no day/month swap — check a date like 4 Nov vs 11 Apr).

#### IMP-05 — Review and edit
On a tour that already has days: dates the tour already has show **Changes**
with "replaces “X”" / "fills a blank" / "adds to current notes" under each
changed cell; **keep** leaves the current value, **use new** takes it back.
Matching days sit under "Already match", not in the list. Edit any cell, untick
a day; the button count follows ("Import N days"). The footer stays pinned at
the bottom however long the list.

#### IMP-06 — Apply (merge-only)
Import. Toast confirms; the Schedule refreshes with the new days and the
changes. Days not in the file are untouched (nothing deleted). If imported days
fall outside the tour dates, the tour now covers them (the review said so before
you clicked). Changing a day's venue name drops its old library-venue link.

#### IMP-07 — Close warning
Mid-read or mid-review, press × → "Discard this import?" bar. **Keep
reviewing** returns to it unchanged; **Discard** closes with nothing imported.
Closing the tab/window mid-review triggers the browser's leave-page warning.

#### IMP-08 — New tour from a tour book
New tour → "Start from a tour book or routing grid" → drop the book → review →
**Use N days**. The routing tab opens with those days filled; name and dates are
filled from the book if empty; the artist is picked if the book's artist matches
one. Nothing is saved until Create.

#### IMP-09 — Word file
Drop a .docx → readable error asking for a PDF; the add screen stays.

#### IMP-10 — Large file
Drop a ~20 MB tour book. Upload succeeds (it goes straight to storage, not
through the 4.5 MB Vercel body limit), the read finishes, and the uploaded file
is deleted afterwards (`tour-files/imports/<workspace>/` is empty).

## Known broken

_None known._ Unverified until live: the `tour-files` bucket's size limit and
signed-upload support; Vercel accepting `maxDuration = 300` on the read route.
