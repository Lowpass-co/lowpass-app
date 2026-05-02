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

## Known broken

(Empty as of the parity followup 2 sprint. Move tests here when a
gap surfaces in a smoke run; reference the issue / PR.)

## Retired

(None yet.)
