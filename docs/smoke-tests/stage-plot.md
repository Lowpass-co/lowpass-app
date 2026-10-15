# Stage Plot smoke tests

> **Last bulk verification**: _not yet run — added with the §SP-FIX
> overhaul sprint (icons → title bar)._

Walk these after changes to the stage-plot surface. Format defined in
`docs/smoke-tests/README.md`. Prefix `SP`.

## Setup / preconditions

- Migrations **109 + 110** applied (`npm run db:migrate`). 110 adds the
  title-bar subtitle/version columns.
- `ANTHROPIC_API_KEY` set on the server (for SP-06/07 generation).
- Surfaces:
  - **Editor (production)**: `/operations/[tourId]/stage-plot`, or the
    artist library `/artists/[id]/stage-plots`.
  - **Icon audit (dev only)**: `/stage-plot-icons`.
  - **Dev editor (localStorage)**: `/stage-plot-editor`.

## Icons (§SP-FIX-1)

#### SP-01 — One visual language

**Do**: Open `/stage-plot-icons`. Scan the canonical anchors + the
drums / amps / monitors / signal sections at 16 / 32 / 80 / 240px.

**Expect**: They read as one set — same stroke weight, rounded caps,
top-down footprints. Kick is a rounded-rect shell (not a circle);
hi-hat is concentric rings; amps are wide cabinets with knob row +
speaker(s); no in-icon text on amps.

**Last verified**:

#### SP-02 — Drop a coherent mix

**Do**: In the editor, drop a kick, a guitar combo, a wedge, a mic
stand, and a DI onto the stage.

**Expect**: Sizes are realistic relative to each other (mic stand ~1ft,
amp ~2ft, wedge ~2ft), all one style. No scale slider in the
properties panel.

**Last verified**:

## Operations route (mount)

#### SP-03 — Stage Plot sub-nav + empty state

**Do**: Open a tour → Operations. Click "Stage Plot" in the sub-nav
(between Channel list and Payroll). With no plot yet, click "Create
stage plot".

**Expect**: The sub-nav item is present; the empty state shows a
Create CTA; creating opens the editor inline on a fresh plot.

**Last verified**:

#### SP-04 — Reopen returns to the plot

**Do**: Add a couple of items, navigate away, come back to
`/operations/[tourId]/stage-plot`.

**Expect**: The single plot opens straight into the editor with your
items intact (tour-scoped, persisted).

**Last verified**:

## Scale enforcement (§SP-FIX-2)

#### SP-05 — Locked footprint, expert override

**Do**: Select an item. Read the "Size (ft)" row. Tick "Custom size
(expert)".

**Expect**: Size shows "W × D · to scale" read-only by default; no
scale slider exists. With expert on, editable W / D / H fields appear.
Risers always show editable W/D/H.

**Last verified**:

## Custom icons + generator (§SP-FIX-1b·5 / §SP10)

#### SP-06 — Generate icon from image

**Do**: In the palette's "Custom (AI)" section, click "Generate icon
from image", pick a PNG/JPG/WebP (≤5MB), name it, set W/D, Generate.

**Expect**: A pending state, then the new icon appears in the Custom
section. (503 = missing API key; 429 = the 1-per-10s rate limit.)

**Last verified**:

#### SP-07 — Custom icon is placeable + persists

**Do**: Drag the generated custom icon onto the stage. Reload the
editor.

**Expect**: It renders to scale on the stage, and survives reload (and
appears in a PDF export).

**Last verified**:

## Drum kit toggle (§SP-FIX-3)

#### SP-08 — Composite → individual → composite

**Do**: Drop a drum kit composite. Select it → Display as "Individual".
Move a piece. Select a piece → Display as "Composite".

**Expect**: Individual produces ~10 pieces (kick/snare/toms/cymbals/
hi-hat/ride/throne) at canonical positions, each independently
movable + to scale. Composite collapses them back to one kit.

**Last verified**:

## Labels (§SP-FIX-4)

#### SP-09 — Label size + position

**Do**: Select an item. Change the Label position select
(top/bottom/left/right/inside/hidden) and drag the Label size slider.

**Expect**: Only the label moves / resizes (8–18px); the item itself
doesn't change size. Hidden removes the label. Labels sit in a pill.

**Last verified**:

#### SP-10 — Person markers are dots

**Do**: Drop a musician/person icon.

**Expect**: It renders as a neutral position dot + name label below
(heavier weight), NOT a head-and-shoulders silhouette.

**Last verified**:

#### SP-11 — No orphan warning

**Do**: Drop a DI or talkback mic and leave it unlinked.

**Expect**: No warning badge/dot — floating items are allowed.

**Last verified**:

## Rotation / layering / risers (§SP-FIX-5)

#### SP-12 — Riser carries its gear when rotated

**Do**: Drop a riser. Drop a drum kit (or a few items) on top of it.
Select the riser, set Rotation to 25°.

**Expect**: The items on the riser rotate WITH it (position + angle).
Items off the riser don't move. Unchecking "Rotate w/ riser" on an
item leaves it axis-aligned.

**Last verified**:

#### SP-13 — Riser doesn't obstruct + shows dims

**Do**: Look at the riser with gear on it.

**Expect**: Riser fill is very faint (gear on top is clearly visible);
a "W × D × H ft" dims label sits on its top edge and rotates with it.

**Last verified**:

#### SP-14 — Z-order

**Do**: Drop two overlapping items. Select one → Layer "Send to back"
/ "Bring to front".

**Expect**: Render order changes accordingly and survives reload.

**Last verified**:

## Colour encoding (§SP-FIX-6)

#### SP-15 — Linked vs unlinked colour

**Do**: Link an item to a channel-list row (Channels section). Toggle
the Channel overlay on (stage settings). Compare to an unlinked item.

**Expect**: Linked item takes its sub-snake colour + a corner letter
badge (overlay on). Unlinked item is a muted brand/orange tint. No
icons are the old uniform blue.

**Last verified**:

## Title bar (§SP-FIX-7)

#### SP-16 — Title-bar form renders on output

**Do**: With nothing selected, fill in the "Title bar" fields
(subtitle, TM name/role/phone/email, version). Export PDF.

**Expect**: A strip under the editor toolbar shows the subtitle + TM
line. In the export (Oct 2026), the **contact strip** under the
letterhead shows the subtitle on the left and `ROLE NAME · phone ·
email · version` on the right (Stage plot panel → "Contact strip").
The title bar can't be dragged.

**Last verified**:

#### SP-17 — Extract from annotations

**Do**: On a plot whose header was built from text boxes, click
"Extract from text annotations".

**Expect**: TM email / phone / role are pulled into the structured
fields.

**Last verified**:

## Export — drawn like the editor (Oct 2026)

Export dialog on a plot with a riser, a person, a text note, an arrow and
items linked to channels on two stage boxes.

#### SP-19 — Everything on the canvas prints

**Do**: Export PDF with defaults.

**Expect**: Page 1 is **landscape**: text notes and arrows print; risers
are a faint outline with `W × D × H ft` (no crossed box); people are
dots; item names sit where the editor puts them (top/left/right/inside,
hidden stays hidden, label size honoured; no custom name → the icon's
name). Rulers / DS cross / centre line follow the plot's settings.

**Last verified**:

#### SP-20 — Channel chips + key

**Do**: Same export.

**Expect**: Linked items carry a chip with their channel number(s) (`1–3`
for a run, `×N` when long) and a stripe in the **stage box** colour — the
same colour as that channel's row in the input list. Beside the plot, a
"Channels" key lists each linked channel → name → item; a muted line
counts channels not placed on the plot. Chips / key / item names each
switch off in the Stage plot panel.

**Last verified**:

#### SP-21 — Grid / rulers override

**Do**: Stage plot panel → Grid **Off**, Rulers **On**.

**Expect**: The printout drops the grid and shows rulers, whatever the
plot has saved. "As the plot" returns to the plot's own setting. The
editor is unchanged.

**Last verified**:

#### SP-22 — Light / dark

**Do**: Look → **Dark**. Then download the PDF.

**Expect**: Preview sheet turns dark. The PDF is dark edge to edge on
the landscape plot page AND the portrait list pages after it. Light is
the default.

**Last verified**:

#### SP-23 — Lists, IO boxes and pulls

**Do**: Sections → tick "Input + output lists", "IO box sheets", the
pulls. Open "Lists, boxes & pulls" to pick boxes / columns / spares.

**Expect**: After the plot, portrait pages identical to the channel-list
export (CHL-31..35): coloured input list, one page per picked box with
every socket, pulls with spares. Reordering sections reorders pages. A
plot with no channel list paired says so once.

**Last verified**:

#### SP-24 — Old templates unchanged + Share packet

**Do**: Apply a stage-plot template saved before Oct 2026. Separately,
open an advance → Share and open the stage plot artifact.

**Expect**: The template prints the same pages it did (new sections are
off); the plot page itself is the new drawing. The Share artifact (no
template) is the default: landscape plot + contact strip + key + chips.

**Last verified**:

#### SP-25 — Public show link uses the same drawing

**Do**: Open a public show link's stage plot tab.

**Expect**: Text notes, arrows, riser outlines and person dots show, in
light, without channel chips.

**Last verified**:

## Builder fixes (Oct 2026)

#### SP-26 — Colour colours the lines only, and resets

**Do**: Select an amp, pick a colour. Then press **Default**. Repeat with
three items selected.

**Expect**: Only the outline takes the colour; the drawing's detail stays
visible (it used to fill solid). Default returns it to grey. In a multi-
selection, Default resets all of them. The export draws it the same way.

**Last verified**:

#### SP-27 — Copy / cut / paste

**Do**: Select two items (one linked to a channel), ⌘C, ⌘V twice. Then ⌘X
and ⌘V. Then ⌘C here and ⌘V in another plot's tab. Then click in the Label
field and ⌘C / ⌘V some text.

**Expect**: Each paste lands 1 ft further on, selected, same look and
labels, **no channel link**. Cut + paste puts it back in place. Pasting
works across plots. Typing in a field copies text as normal. ⌘D duplicates
the same way; a duplicated split-kit piece no longer rejoins the original
kit on "Composite".

**Last verified**:

#### SP-28 — Smaller labels, smaller power drops

**Do**: Show a label on an item that was never resized. Place a power
drop. Run migration 271, reload a plot with old power drops / guitars /
mic stands.

**Expect**: Labels default to 9 px (hand-sized ones keep their size; the
slider goes 6–18). Power drops are 1.3 ft wide. After 271, old-default
items take the new sizes; hand-sized ones don't move.

**Last verified**:

#### SP-29 — Mic stands from above, compact guitars

**Do**: Place a boom stand, a straight stand, a short stand, an electric,
a bass and an acoustic.

**Expect**: Stands are drawn from above (tripod Y + boom line, round
base), matching the rest of the plot. Guitars are recognisable at ~1.2 ×
2 ft. Same in the PDF export.

**Last verified**:

#### SP-30 — Channels panel

**Do**: Left column → **Channels**. Drag a channel onto an item; drag the
same channel onto another item; drag an unplaced channel onto empty stage;
apply "Link by name"; click a placed channel; add "TALKBACK" with New
channel; re-pair the plot to another channel list.

**Expect**: Header counts "N of M on the plot". A drag outlines the target
item in orange; dropping links it, and a second drop MOVES the link. Empty
stage drops a mic (kick/OH/tom/talkback by name, DI for DI-only) already
linked. Suggestions only list clear best matches. Clicking selects the
item. The new channel appears at the end of the paired channel list (open
it to confirm — it used to vanish on reload). Re-pairing refreshes the
list without a reload.

**Last verified**:

#### SP-31 — Stage box sheets on the stage plot export (Oct 2026)

**Do**: Stage plot export → turn OFF channel key + channel numbers, then
open "Lists, boxes & pulls" → untick "Every box" → tick Stage box sheets
under Sections.

**Expect**: Every stage box is listed and ticked (the picker always has
the boxes now — it used to be empty here, saving an empty pick that printed
"No IO boxes"). One page per box.

**Last verified**:

#### SP-32 — Off-stage items are on the export (Oct 2026)

**Do**: Place something past stage left, something past stage right and
something behind the upstage edge (e.g. side-fills, a wing rack). Export.

**Expect**: Everything placed is on the page — the drawing grows to fit
(it used to stop at the stage edge plus a small margin, cutting wing gear
off). Labels and channel numbers on off-stage items are inside too. A plot
with nothing off stage looks exactly as before.

**Last verified**:

## Known broken

_(none recorded yet — populate as smoke runs surface gaps.)_

## Retired

_(none yet.)_

## Rider-pack linking (B2)

- **RIDER-01** (needs-live) On the stage-plot editor, the "Channel list" picker
  lists channel-list packs on the tour; selecting one PATCHes the stage plot's
  `linked_rider_pack_id` and the linked list's channels appear in the editor.
  Unlink clears it. From the Channel-list tab, the "Stage plot" picker links the
  chosen stage-plot pack back to this list. Cross-workspace isolation: PATCHing
  `linked_rider_pack_id` to a pack in another workspace 404s (RLS SELECT gate);
  self-link 400s. (PATCH /api/rider-packs/[id]; `LinkedRiderPackControl`)

## Channel assignment discoverable (SP-05 / A#11)

> The channel-link control was fully built but hidden behind `channels.length > 0`
> in ItemProperties, so with no channel list paired the whole Channels section was
> absent on item select — the feature read as missing. Un-gated + a pairing prompt;
> canvas channel numbers now default-on. (The number stays a derived read-only
> ordinal — making it editable = reorder the source list, which is the G2
> "stage-plot inspector overhaul", not this exposure fix.)

- **SP-05a — Channels section always shows on item select.** Select any icon item:
  the inspector shows a "Channels" section. With a channel list paired it shows the
  linked channels + "+ Link existing channel…" select + unlink; with none paired it
  shows a prompt pointing at the header "Linked channel list" control.
- **SP-05b — channel numbers visible on the canvas by default.** `DEFAULT_PLOT.showChannels`
  is now `true`; a linked item shows its channel number chip on the canvas without
  hunting for the overlay toggle. Items with no channel link show no chip (clean).
- **SP-05c — read-only number + discoverable reorder jump (G2-3).** The channel
  number stays read-only in the inspector (it's the derived row-order in the paired
  list). When a channel list is linked, the Channels section header shows a
  **"Reorder in list ↗"** link → `/rider-packs/[linkedId]?mode=edit`, so the way to
  renumber (reorder the source list) is one click away. No cross-surface write added.
  (Adam's ruling: keep read-only + jump link, not inline reorder.)

## Inspector restyle to system (G2-3)

- **SP-18 — inspector numeric values are mono.** Select an item: X/Y/W/D/H/rotation
  inputs, the octant **Position** readout, the "to scale" size, the label-size px
  readout, and linked channel numbers all render in `var(--lp-font-numeric)` (was a
  raw `var(--font-mono, monospace)` on Position; the rest were body font). Numbers
  read as data. No control added or removed.
