# Advance smoke tests

> **Last bulk verification**: pending — to be filled after Adam's first run on Vercel preview post-merge.

Per `docs/smoke-tests/README.md`. Walk these on Vercel preview after
every non-trivial advance change. ID prefix is `ADV`.

## Shell + chrome

#### ADV-01 — Three-zone layout

**Do**: Open `/advance/[any]/[any]`.

**Expect**: Three columns visible — 280px upcoming-shows sidebar on
the left, main column in the middle, 300px right rail on the right.

**Last verified**:

#### ADV-02 — Single in-page header layer

**Do**: Open `/advance/[any]/[any]`. Look at the area between
`AdvanceSubHeader` and the section list.

**Expect**: One header card — the chunky `AdvanceShowHeader` with the
progress strip and circular ring. No second context bar. No
"← Advance / Sat 21 Mar / Print / Edit advance" toolbar.

**Last verified**:

#### ADV-03 — Chunky strip totals match section list

**Do**: Open `/advance/[any]/[any]` with at least 3 sections.
Count sections whose status pill says "COMPLETE" (green).

**Expect**: The "Complete" tile in the chunky strip matches.
Pending + Overdue + Complete sum to total.

**Last verified**:

#### ADV-04 — Sticky sub-header doesn't overlap content on scroll

**Do**: Open `/advance/[any]/[any]`. Scroll the main column down.

**Expect**: AdvanceSubHeader stays at the top with an opaque background.
Content scrolls underneath, not over.

**Last verified**:

#### ADV-05 — Print button in sub-header opens print dialog

**Do**: Click the Print button in `AdvanceSubHeader` (read mode only).

**Expect**: Browser print dialog opens with the read view rendered
print-friendly.

**Last verified**:

#### ADV-06 — Show / Template Builder tab toggle works

**Do**: Click "Template Builder" tab in `AdvanceSubHeader`.

**Expect**: URL becomes `?mode=edit`. Right rail swaps from the
read-mode rail (Specs / Contacts / Previously Played) to the
builder Field Properties panel.

**Last verified**:

## Read mode — sections + fields

#### ADV-20 — Section header strip layout

**Do**: Look at any section's header strip in read mode.

**Expect**: Uppercase section title, mini progress bar, "X / Y" done
count badge, status pill on the right, caret to collapse. Drag handle
is hidden in read mode.

**Last verified**:

#### ADV-21 — Section caret collapses + animates smoothly

**Do**: Click a section's caret.

**Expect**: Body collapses with a smooth ~200ms animation (no jump).
Caret rotates 90° on the same timing.

**Last verified**:

#### ADV-22 — Status pill is a branded dropdown (not native select)

**Do**: Click a section's status pill.

**Expect**: A custom-branded panel opens below the pill, options each
showing a coloured swatch + label. Outside-click closes. Arrow keys
navigate. Enter commits.

**Last verified**:

#### ADV-23 — Status change persists + chunky strip refreshes

**Do**: Change a section's status. Refresh the page.

**Expect**: New status persists. The chunky strip's totals updated
immediately on the change (without manual refresh) — `router.refresh`
keeps the server-rendered totals in sync.

**Last verified**:

#### ADV-30 — Field rows render as a 2-col dense grid

**Do**: Look at any non-empty section's field rows.

**Expect**: Two columns: label cell (with `--lp-bg-deep` background)
+ value cell. Visible row borders. Visible column divider between
the two cells. Hover fills the entire row.

**Last verified**:

#### ADV-31 — No field-type icon column in read mode

**Do**: Scan field rows in read mode.

**Expect**: No type-icon column. Field-type icons are builder-only.

**Last verified**:

#### ADV-32 — Required fields show asterisk

**Do**: Find a required field with no value entered.

**Expect**: Trailing red asterisk after the label. No "Required" text.

**Last verified**:

## Right rail (read mode)

#### ADV-40 — Three rail cards stacked

**Do**: Scan the right rail in read mode.

**Expect**: Three cards top to bottom — Venue Specs / Key Contacts /
Previously Played. Each card has an uppercase tracked-wider title,
borders match the rest of the visual language.

**Last verified**:

#### ADV-41 — Venue specs render only for non-null fields

**Do**: Open a show with `venue_capacity` populated and
`venue_phone` null on the routing record.

**Expect**: Capacity row visible with a mono numeric value. Phone row
absent. No empty-row placeholder.

**Last verified**:

#### ADV-42 — Key contacts pulled from filled contact fields

**Do**: Open a show whose Hospitality / Production sections have
contact fields filled with promoter/venue/production-manager roles.

**Expect**: Each shows up in the rail's Key Contacts card with name,
role, phone (mono), email. Other roles (e.g. catering rep) don't.

**Last verified**:

#### ADV-43 — Previously Played card shows last prior advance

**Do**: Open a show whose venue has at least one prior advance in
the workspace's history.

**Expect**: Rail's PREVIOUSLY PLAYED card shows date (mono uppercase)
+ tour name + "View past advance →" link in orange.

**Last verified**:

#### ADV-44 — Click "View past advance" opens slide-over

**Do**: Click "View past advance →" in the rail.

**Expect**: `PreviouslyPlayedSlideOver` opens with the matched past
shows listed.

**Last verified**:

#### ADV-45 — Slide-over leads with "Import sections from this advance"

**Do**: Inside the slide-over, click any past show to enter its
section picker.

**Expect**: First heading reads "Import sections from this advance"
(uppercase tracked-wider). Footer button: "Import N sections".

**Last verified**:

## Builder mode

#### ADV-60 — Three-pane layout

**Do**: Open `/advance/[any]/[any]?mode=edit`.

**Expect**: Three panes — `AdvanceSectionLibrary` (280px) on the
left, canvas in the middle (with `TemplateMetaBar` sticky at top
and `SectionDropZone` at the bottom), `AdvanceFieldPropertiesPanel`
(300px) on the right.

**Last verified**:

#### ADV-61 — Library cards drag

**Do**: Pick a library card and drag it.

**Expect**: Drag image follows the cursor. Card sets the
`SECTION_LIBRARY_DRAG_TYPE` data transfer.

**Last verified**:

#### ADV-62 — Drop zone tints orange on dragover

**Do**: Drag a library card over the drop zone.

**Expect**: Drop-zone border turns orange, background tints
~5% orange.

**Last verified**:

#### ADV-63 — TemplateMetaBar Apply-to-tour button opens the slide-over

**Do**: Click "Apply to tour(s)" in `TemplateMetaBar`.

**Expect**: `ApplyAdvanceTemplateSlideOver` mounts. Lazy-fetches both
dates and templates on first open. Shows a loading state until both
arrive.

**Last verified**:

#### ADV-64 — TemplateMetaBar Copy-from-show button opens the modal

**Do**: Click "Copy from show…" in `TemplateMetaBar`.

**Expect**: `CopyAdvanceModal` opens. Lazy-fetches dates list on
first open.

**Last verified**:

#### ADV-65 — Field-def row click populates Properties panel

**Do**: Click any field-def row in the canvas.

**Expect**: Within ~100ms, the right-rail `AdvanceFieldPropertiesPanel`
populates with the row's data (label, type, required). Selected row
gets a 2px orange left border + 6% orange tint background.

**Last verified**:

#### ADV-66 — Library drag → adds section to canvas

**Do**: Drag a library card onto the drop zone.

**Expect**: A new section appears in the canvas with the dropped
seed's label. If a workspace template matching that label exists,
its full field set comes in. Otherwise the section is empty (a
blank custom section).

**Last verified**:

#### ADV-67 — Apply-to-tour applies the template

**Do**: Open `ApplyAdvanceTemplateSlideOver` from `TemplateMetaBar`,
pick a template, pick at least one show, click Apply.

**Expect**: Slide-over closes. Page refreshes. The selected shows
have the applied template's sections.

**Last verified**:

#### ADV-68 — Field-properties panel edits propagate to the canvas

**Do**: Click a field-def row in the canvas. In the panel, change the
label or toggle Required.

**Expect**: The row in the canvas re-renders with the new label /
required marker without a page reload. Existing autosave path
persists the change.

**Last verified**:

#### ADV-69 — Field type icon grid: five buttons, no photo proof

**Do**: Look at the Field type icon grid in the panel.

**Expect**: 5 buttons (text / checkbox / number / dropdown / file).
No "photo proof" or "evidence" button anywhere.

**Last verified**:

## Copy flow

#### ADV-80 — Copy with empty destination is one-step

**Do**: Trigger Copy against a destination that has no field values
yet. Pick a source, click the primary button.

**Expect**: Copy executes immediately, no conflict prompt.

**Last verified**:

#### ADV-81 — Copy with destination data shows three-option prompt

**Do**: Trigger Copy against a destination that already has field
values. Click the primary button.

**Expect**: A confirmation panel appears with two radio choices:
**Fill blanks only** (default, selected) and **Replace all**. Cancel
button still on the modal footer.

**Last verified**:

#### ADV-82 — "Fill blanks only" preserves existing destination values

**Do**: Pick "Fill blanks only" + click the primary button.

**Expect**: After the copy, the destination's previously-entered
field values are unchanged. Empty fields receive source values.
Section statuses on the destination are unchanged.

**Last verified**:

#### ADV-83 — "Replace all" overwrites destination

**Do**: Pick "Replace all" + click the primary button.

**Expect**: Destination data + section statuses both reflect the
source. (Destructive — the radio's hint copy says so.)

**Last verified**:

#### ADV-84 — Cancel option closes without changes

**Do**: With the conflict prompt visible, click the modal's Cancel
button (not a radio).

**Expect**: Modal closes. Destination unchanged.

**Last verified**:

## Adam's locks (negative-space tests)

#### ADV-90 — No "Mark All Complete" button anywhere

**Do**: `grep -ri "Mark All Complete\|Mark all complete" src/` (or
visually scan the surface).

**Expect**: Zero matches outside code comments asserting the lock.

**Last verified**:

#### ADV-91 — No "Tasks Done" framing anywhere

**Do**: Same grep for "Tasks Done" / "tasks done".

**Expect**: Zero matches outside asserting comments. The progress
caption reads "X / Y sections complete", not "X tasks done".

**Last verified**:

#### ADV-92 — No "photo proof" / "evidence photo" anywhere

**Do**: `grep -ri "photo proof\|evidence photo\|Require photo" src/`.

**Expect**: Zero matches. The Field type icon grid does not include
a photo-proof button.

**Last verified**:

## Per-show read redesign (UX Audit 2026 — T1 / T2)

#### ADV-93 — Field cells read missing vs filled at a glance

**Do**: Open `/advance/[tour]/[show]`. Scan the section grids.

**Expect**: Every field is a tile — empty fields are amber-dashed
("missing"), filled fields are solid with an emerald right edge. No
empty fields are hidden (auth view).

**Last verified**:

#### ADV-94 — Inline fill autosaves

**Do**: Click a missing (amber) cell and type a value; click away.

**Expect**: The cell flips to the filled (emerald-edge) style; a
"Saving… → Saved ✓" pill appears top-right. Reload → value persists.

**Last verified**:

#### ADV-95 — Section header: completed pill + state badge

**Do**: Look at any section card header.

**Expect**: Shows an "X / Y completed" pill and a "Needs Input"
(amber, pulsing dot) or "Complete" (emerald) badge; the caret
collapses/expands the grid.

**Last verified**:

#### ADV-96 — Glass hero with completion ring + stats

**Do**: Look at the top of the per-show page.

**Expect**: Glass hero with a date chip, "Missing info" warning when
incomplete, big venue title, address line, and a stats row
(completion ring + Complete / Pending / Overdue). Actions: "Edit
Template" (outline) + "Send Packet" (orange).

**Last verified**:

#### ADV-97 — Read surface is adaptive (light/dark)

**Do**: Toggle the app theme on the per-show page.

**Expect**: Cells, hero, and badges adapt via tokens (amber =
needs-review, emerald = complete, brand = orange). No hardcoded dark
colours leaking in light mode.

**Last verified**:

## Template Builder re-skin (UX Audit 2026 — T2.5)

#### ADV-98 — Canvas grid + elevated section cards

**Do**: Open the builder (`?mode=edit` / Template Builder tab).

**Expect**: The canvas shows a faint grid texture; section cards are
elevated; the card holding the currently selected field gets an
orange ring.

**Last verified**:

#### ADV-99 — Required / Optional field badges

**Do**: Look at the field rows inside a section card.

**Expect**: Required = solid-orange badge; Optional = muted badge.

**Last verified**:

#### ADV-100 — Field Properties panel layout

**Do**: Click a field; look at the right rail.

**Expect**: Titled "Field Properties"; TYPE row, Field Label,
Placeholder Text, Help Text, a VALIDATION group with Required +
Read-only pill toggles, and a Delete Field button. (Required / Label /
Type are wired; Placeholder / Read-only / Delete are design-surfaced —
see Known broken.)

**Last verified**:

#### ADV-101 — Library active card highlight

**Do**: Expand a card in the left section library.

**Expect**: The expanded (active) card takes the orange treatment
(tinted bg + orange border).

**Last verified**:

## Builder field-level palette + contacts (advance-builder-fixes)

#### ADV-102 — Click a palette field to add just that field

**Do**: In the builder, expand a group in the left palette and click
a single field row.

**Expect**: That one field lands in its group's section on the canvas
(the section is created if absent). Clicking the same field again is a
no-op (de-duped by id).

**Last verified**:

#### ADV-103 — Drag a single field onto the canvas

**Do**: Drag a single field row from the palette onto the "Drop a
section or field here" zone.

**Expect**: Same result as ADV-102 (single field appended).

**Last verified**:

#### ADV-104 — Key Contacts pinned first in the palette

**Do**: Open the builder; look at the palette's Platform group.

**Expect**: "Key Contacts" is the first card.

**Last verified**:

#### ADV-105 — Section / header reorder

**Do**: Drag a section card above/below another to reorder headers;
Save layout; reload.

**Expect**: The new section order persists. (Flagged for live
confirmation — native drag can't be exercised in CI.)

**Last verified**:

## Send Packet venue intake (T3) — requires migrations 107 + 108

#### ADV-106 — Generate + copy + revoke an intake link

**Do**: Per-show advance → "Send Packet" → set recipient + expiry →
"Generate link". Then Copy, then Revoke.

**Expect**: A `/advance-intake/<token>` URL appears and is
auto-copied; the list shows it with Copy + Revoke; revoking removes it
from the active list.

**Last verified**:

#### ADV-107 — Public venue form submits

**Do**: Open `/advance-intake/<token>` (logged out / incognito), fill
fields, submit.

**Expect**: A branded form with the show's fillable fields, required
validation, and a "Thanks — your details are in" success state. Never
shows the TM's existing advance data.

**Last verified**:

#### ADV-108 — Submission merges back into the advance

**Do**: After ADV-107, reopen the show's advance in the app.

**Expect**: The venue's answers now show as filled (emerald) cells;
blanks left by the venue didn't wipe existing values.

**Last verified**:

#### ADV-109 — Revoked / expired link is blocked

**Do**: Open a revoked or expired token URL.

**Expect**: "This link isn't available" / "This link has expired" —
no form, no submit.

**Last verified**:

#### ADV-110 — TM emailed on submit

**Do**: Submit a venue form; wait one cron tick (~5 min) with
`RESEND_API_KEY` + `CRON_SECRET` set.

**Expect**: The link creator (account email) receives "<Venue>
submitted their advance details". Sent exactly once.

**Last verified**:

## Known broken

#### ADV-100 (partial) — Field Properties: 3 controls are design-only

**Currently**: The Field Properties panel renders fully, but
Placeholder Text, "Read-only for users", and Delete Field are
surfaced visually and not yet wired to the builder's save path
(Required / Label / Type ARE wired). Delete Field fires
`advance:field-delete` which the canvas does not yet consume.

**Tracked in**: design/ux-audit-2026 T2.5 follow-up.

#### ADV-105 — Section/header reorder needs live confirmation

**Currently**: Static recon shows section reorder + persistence
already work (moveSectionOrder + section-card drag + saveLayout writes
`order`); native drag-drop can't be exercised in CI. Confirm on a
preview before relying on it; if it fails, capture the exact
behaviour (drag does nothing? doesn't persist?).

**Tracked in**: feat/advance-builder-fixes §2.

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

## Retired

(None yet.)
