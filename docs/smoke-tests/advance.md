# Advance smoke tests

> **Last bulk verification**: pending — first run on the Vercel preview of the
> Advance rebuild (Oct 2026). Needs migrations **276** and **277** pasted first.

Per `docs/smoke-tests/README.md`. Walk these on Vercel preview after
every non-trivial advance change. ID prefix is `ADV`.

The Advance rebuild (Oct 2026) replaced every surface the old ADV-01…ADV-116
tests described (the three-zone show page, the Template Builder, the copy
flow, Send Packet). Those IDs are listed under **Retired** — except the venue
form tests, which still describe live behaviour and stay below.

Surfaces: `/advance/[tourId]` (board) · `/advance/[tourId]/[routingId]` (show) ·
`/advance/[tourId]/templates` · the public venue form `/advance-intake/[token]`.

## Board

#### ADV-120 — Board lists every day, folds gaps

**Do**: Open `/advance/[tourId]` on a tour with shows and days off.

**Expect**: One row per show with a status cell per question group; runs of
days off fold into one quiet gap row. Counts at the top (not sent / waiting /
to review / done) match the rows. Nothing is written by opening the page.

#### ADV-121 — Search finds answers, `/` focuses it

**Do**: Press `/`, type a value you know is in one show's answers (e.g. a
production manager's surname).

**Expect**: The box focuses; only matching shows remain, each with the
matching answer shown under the venue. Clearing restores the board.

#### ADV-122 — Row → show animates

**Do**: Click a show row.

**Expect**: The venue name glides into the show page title (view
transition); with reduced motion on, it simply navigates.

## Show

#### ADV-123 — Answers autosave, times are 24-hour

**Do**: On a show, type `7.30pm` in a time question, tab away; reload.

**Expect**: It reads `19:30` and survives the reload. Other answers in the
same group are untouched.

#### ADV-124 — Hotel, flights and deal are read-only links

**Do**: Look for the Hotel / Flights / Deal cards on a show.

**Expect**: Each shows what the home page holds (Hotels & rooming, Travel,
Income) with a link there; no inputs on the advance.

#### ADV-125 — Local crew calls live on the show

**Do**: From Schedule, expand a day and click **Crew calls** (shows the call
count).

**Expect**: Lands on that show's advance scrolled to **Local crew calls**;
adding a call there shows up in the count back on Schedule.

#### ADV-126 — Customise this day only

**Do**: Customise drawer → add a question → save for this day only.

**Expect**: Only this show gains it; the day is marked customised and later
template edits skip it.

## Templates

#### ADV-127 — Day types pick the template

**Do**: `/advance/[tourId]/templates` → set "Festival" → a template.

**Expect**: Festival days not yet customised or sent switch to it; customised
or sent days keep theirs.

#### ADV-128 — Editing a template updates its days

**Do**: Add a question to a template.

**Expect**: Every day on that template that isn't customised or sent gains it.

## Asking the venue

#### ADV-129 — Request: link + email, no app email

**Do**: Show → **Request from venue** → pick questions → Open in Gmail (or
the mail app, or Copy).

**Expect**: Gmail opens with the link and a short message from you; Lowpass
sends nothing itself. Choosing any of the three marks the request sent: the
board shows it as sent with the date, and after 7 days unanswered it flags a
chase.

#### ADV-130 — Venue only sees the questions asked

**Do**: Open the link in a private window.

**Expect**: Only the picked questions appear; TM-only questions never do.
`?print=1` gives a printable list of the same questions.

#### ADV-107 — Public venue form submits

**Do**: Fill and submit the venue form.

**Expect**: "Thanks — your details are in". Reopening the link says it was
already submitted and lets the venue update their answers.

#### ADV-108 — Submission comes back for review

**Do**: Reopen the show as the TM.

**Expect**: A review banner; each venue answer shows beside the current one
with Accept / Keep mine. Nothing overwrites without a click.

#### ADV-109 — Revoked / expired link is blocked

**Do**: Open a revoked or expired link.

**Expect**: "This link has expired" (or invalid/revoked) — no form.

#### ADV-110 — TM emailed on submit

**Do**: Submit a venue form for a link you made.

**Expect**: One email to you (the link's creator), not one per save.

#### ADV-114 — Public intake renders the venue form

**Do**: Open an intake link whose questions include Venue Info.

**Expect**: The venue fields render as editable inputs.

## Info packs

#### ADV-131 — Drop packs, review suggestions with the source shown

**Do**: Drag one or more venue PDFs onto the board (or a show).

**Expect**: It matches each pack to a show (you can change it), reads it, and
walks you through suggested answers. Each suggestion opens the pack at the
right page with the quoted text boxed; if the text can't be found the page
is outlined instead — never a box in the wrong place.

#### ADV-132 — Extra facts become questions only if you say so

**Do**: In the same flow, look at facts the pack had that no question asks.

**Expect**: Each is offered as a new question (this day or the template);
nothing is added unless ticked.

#### ADV-133 — Packs are kept; sources reopen

**Do**: Save, then click the source chip on an answer that came from a pack.

**Expect**: The pack opens at that place. The pack is listed under Venue
documents and opens from there too.

#### ADV-138 — A pack that can't be read says so

**Do**: Drop a file the reader can't handle (e.g. a password-protected PDF)
on a show.

**Expect**: The file row turns red with the reason and the flow stays there —
it does not jump to "Not in the packs" with every question listed. A pack that
reads but answers nothing says so in a note above the questions.

#### ADV-139 — Text PDFs read in production; 50 MB limit

**Do**: Drop the Exit/In tech pack (12 MB, Adobe Express) on its show; then
try a file over 50 MB.

**Expect**: Suggestions come back (contacts, PA, console, hotels, parking).
The over-50 MB file is refused at upload with "Each file must be under 50 MB."
A scanned PDF (no text) over 22 MB or 100 pages is refused with a reason.

## Day sheets retired

#### ADV-134 — Old day sheet URLs land on the advance

**Do**: Open `/operations/[tourId]/day`, `/operations/[tourId]/day/[routingId]`
and `/operations/[tourId]/labor`.

**Expect**: They redirect to `/advance/[tourId]` (or that show's advance).
The rail has no Day sheets item.

#### ADV-135 — Old crew phone links say so

**Do**: Open an old `/m/day/<token>` link.

**Expect**: "This link is no longer active" — no tour data on the page.

#### ADV-136 — Mobile Today opens the show

**Do**: Open `/m/today` on a phone with a tour picked.

**Expect**: Today's show (else the next, else the last) opens in the mobile
show reader.

## Venue-info auto-fill from the linked venue (feat/advance-venue-autofill)

> Direction A — world-readable venue FACTS flow INTO the private, workspace-scoped
> advance (never advance data leaving the workspace). The advance GET already
> pre-filled the Venue Info section (venue_name/address/website/capacity) from the
> routing row; this adds the LINKED canonical venue (routing.canonical_venue_id →
> canonical_venues.name/address/capacity, from Part 1) as a FALLBACK tier when a
> routing fact is still blank. NON-DESTRUCTIVE — `current.X ?? routing.X ?? canon.X`
> only fills blank fields, never overwrites a user entry. (No separate "locked
> advance" concept exists on advance_instances; the non-destructive fill respects
> whatever's already saved, so it's safe on any advance.) The template has only
> name/address/capacity/website venue fields, so those are what's filled. Floor green.
> Verified: node harness on the exact merge expression.

- **ADV-VEN-01 — fills from routing.** A blank advance's Venue Info gets
  venue_name/address/capacity from the routing row. (Proven.)
- **ADV-VEN-02 — canonical library fallback.** When a routing fact is blank and the
  row is library-linked, the canonical venue's address/capacity/name fill it; routing
  still wins over canonical when both are present. (Proven.)
- **ADV-VEN-03 — non-destructive.** A user-entered venue name/address/capacity is
  NEVER overwritten by routing or the canonical venue on reload. (Proven.)
- **ADV-VEN-04 — no source → blank.** No routing + no canonical → the field stays
  blank, no crash. (Proven.)
- **RLS / Direction A.** The canonical venue is read via the authed server client
  (world-readable facts); only the routing rows for THIS tour are read; nothing reads
  another workspace's advance data. The advance stays workspace-private.

> These were written for the old show page; **re-verify on the rebuild** (the
> show and board read the venue through `resolveAdvanceVenue`).

## Known broken

#### ADV-137 — No TM-side export of a filled advance

**Currently**: The old header "Export advance" button (ADV-115/116) was not
carried into the rebuild. The venue-facing printable question list exists
(`?print=1`); an export of the filled advance does not.
**Tracked in**: Advance rebuild PR — follow-up.

## Retired

Retired by the Advance rebuild (Oct 2026); the surfaces they describe no
longer exist. IDs are never recycled.

- ADV-01 — Three-zone layout
- ADV-02 — Single in-page header layer
- ADV-03 — Chunky strip totals match section list
- ADV-04 — Sticky sub-header doesn't overlap content on scroll
- ADV-05 — Print button in sub-header opens print dialog
- ADV-06 — Show / Template Builder tab toggle works
- ADV-20 — Section header strip layout
- ADV-21 — Section caret collapses + animates smoothly
- ADV-22 — Status pill is a branded dropdown (not native select)
- ADV-23 — Status change persists + chunky strip refreshes
- ADV-30 — Field rows render as a 2-col dense grid
- ADV-31 — No field-type icon column in read mode
- ADV-32 — Required fields show asterisk
- ADV-50 — Three rail cards stacked
- ADV-51 — Venue specs render only for non-null fields
- ADV-42 — Key contacts pulled from filled contact fields
- ADV-43 — Previously Played card shows last prior advance
- ADV-44 — Click "View past advance" opens slide-over
- ADV-45 — Slide-over leads with "Import sections from this advance"
- ADV-60 — Three-pane layout
- ADV-61 — Library cards drag
- ADV-62 — Drop zone tints orange on dragover
- ADV-63 — TemplateMetaBar Apply-to-tour button opens the slide-over
- ADV-64 — TemplateMetaBar Copy-from-show button opens the modal
- ADV-65 — Field-def row click populates Properties panel
- ADV-66 — Library drag → adds section to canvas
- ADV-67 — Apply-to-tour applies the template
- ADV-68 — Field-properties panel edits propagate to the canvas
- ADV-69 — Field type icon grid: five buttons, no photo proof
- ADV-80 — Copy with empty destination is one-step
- ADV-81 — Copy with destination data shows three-option prompt
- ADV-82 — "Fill blanks only" preserves existing destination values
- ADV-83 — "Replace all" overwrites destination
- ADV-84 — Cancel option closes without changes
- ADV-90 — No "Mark All Complete" button anywhere
- ADV-91 — No "Tasks Done" framing anywhere
- ADV-92 — No "photo proof" / "evidence photo" anywhere
- ADV-93 — Field cells read missing vs filled at a glance
- ADV-94 — Inline fill autosaves
- ADV-95 — Section header: completed pill + state badge
- ADV-96 — Glass hero with completion ring + stats
- ADV-97 — Read surface is adaptive (light/dark)
- ADV-98 — Canvas grid + elevated section cards
- ADV-99 — Required / Optional field badges
- ADV-100 — Field Properties panel layout
- ADV-101 — Library active card highlight
- ADV-102 — Click a palette field to add just that field
- ADV-103 — Drag a single field onto the canvas
- ADV-104 — Key Contacts pinned first in the palette
- ADV-105 — Section / header reorder
- ADV-106 — Generate + copy + revoke an intake link
- ADV-110 — no-default start prompt
- ADV-111 — save-as-tour-default fans out
- ADV-112 — any day opens an advance
- ADV-113 — rail "Edit venue info" jumps to the section
- ADV-115 — Export advance visible beside Send Packet
- ADV-116 — scope routes to the packet PDF

Day sheet tests (DAY-*, ROLE-*) are retired with day sheets — see
`docs/smoke-tests/day.md`.
