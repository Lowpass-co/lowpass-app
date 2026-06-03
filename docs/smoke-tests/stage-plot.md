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
line; the PDF header shows title + subtitle + TM block + version
footer. The title bar can't be dragged.

**Last verified**:

#### SP-17 — Extract from annotations

**Do**: On a plot whose header was built from text boxes, click
"Extract from text annotations".

**Expect**: TM email / phone / role are pulled into the structured
fields.

**Last verified**:

## Known broken

_(none recorded yet — populate as smoke runs surface gaps.)_

## Retired

_(none yet.)_
