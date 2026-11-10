# Parking maps smoke tests

> **Last bulk verification**: (pending — feat/parking-maps)

Walk these after changes to the parking editor, its PDF, or the Google tiles.
Format defined in `docs/smoke-tests/README.md`. Prefix: `PRK`.
**Prereq: migration 287 applied; `NEXT_PUBLIC_GOOGLE_MAP_TILES_KEY` set (a
browser key restricted to the Map Tiles API and the app's domains).**

## Way in

#### PRK-01 — Parking lives under Production; the advance links to it

**Do**: Open a tour; in the rail under **Production**, click **Parking**. Then open any show's advance.

**Expect**: Parking lists every show day (days off and travel days left out) with its map ("2 buses · 1 truck" / "Not drawn") and PDF date; clicking a row opens that show's map. On the advance, "From elsewhere in Lowpass" has a **Parking** line ("No parking map yet" / the count) with "Draw it in Parking →" / "Edit in Parking →" to the same map. The editor's "All shows" goes back to the list; "Advance" goes to the show's advance.

**Last verified**:

#### PRK-02 — Opening writes nothing

**Do**: Open the parking map for a show that has never had one; leave without touching anything.

**Expect**: No `parking_maps` row is created (Parking still says "Not drawn").

**Last verified**:

#### PRK-03 — A venue with no map position

**Do**: Open parking for a show whose venue was typed (not picked from Google).

**Expect**: "Where is <venue>?" — searching the address, or pasting `53.8027, -1.5446`, opens the map pinned there.

**Last verified**:

## Drawing

#### PRK-04 — Satellite imagery, pinned and attributed

**Do**: Open First Direct Arena, Leeds.

**Expect**: Google satellite imagery centred on the venue pin; "Google Maps · <imagery credit>" bottom right; scale bar bottom left.

**Last verified**:

#### PRK-05 — A bus is true size

**Do**: Add "Tour bus, EU / UK", then Measure from one end of it to the other.

**Expect**: The measurement reads 13.5 m (± a few cm from where you clicked). Zoom and rotate the map: the bus stays the same size against the imagery.

**Last verified**:

#### PRK-06 — Move, turn, nudge, undo

**Do**: Drag a vehicle; drag its white knob to turn it; select it and press arrow keys / Shift+arrow, `[` / `]`; then ⌘Z repeatedly.

**Expect**: Drag moves; the knob turns in 5° steps (Shift = free); arrows nudge 10 cm / 1 m along the screen; brackets turn 5° / 45°; ⌘Z walks every step back, ⌘⇧Z forward.

**Last verified**:

#### PRK-07 — Routes, areas, measurements

**Do**: Draw a route (click points, double-click or Enter), a crew-parking area, and a measurement (two clicks).

**Expect**: Route in cyan with arrows; area shaded with its label; measurement labelled in metres. Esc cancels a drawing; Backspace removes the last point.

**Last verified**:

#### PRK-08 — Square the map to the building

**Do**: Turn the map with the ↺ / ↻ buttons; select a bus and press the arrow-pointer button.

**Expect**: Map and drawing turn together; the compass shows where north is; the pointer button turns the map so that bus points up. The compass button resets north up.

**Last verified**:

## Saving

#### PRK-09 — Autosave survives a reload

**Do**: Add a truck and type notes; wait for "Saved"; reload.

**Expect**: Everything is where you left it, including the view.

**Last verified**:

#### PRK-10 — Two tabs never overwrite each other silently

**Do**: Open the same map in two tabs. Change something in tab A, wait for Saved. Change something in tab B.

**Expect**: Tab B shows "This map was changed somewhere else…" with **Load theirs** / **Keep mine**; nothing is lost until you choose.

**Last verified**:

#### PRK-11 — Read-only members can look, not edit

**Do**: Open a map as a read-only member.

**Expect**: The map and its notes show; no add / draw tools; nothing saves. Export PDF opens the PDF but doesn't save it to Files.

**Last verified**:

## PDF

#### PRK-12 — Export: page 1, true scale, saved and linked

**Do**: Press **Export PDF**.

**Expect**: An A4 landscape PDF opens: title + date, the map at a stated scale ("Scale 1:500 at A4"), scale bar, north arrow (pointing the right way when the map is turned), Google attribution, a key of vehicles / markers / areas, notes, and a "Get there" Google Maps link for each gate (else the venue). It lands in tour Files › Parking maps and appears in the show's Files card.

**Last verified**:

#### PRK-14 — The PDF frames the drawing, not the window

**Do**: Draw one bus and two markers; zoom the editor right out on a wide screen; Export PDF.

**Expect**: The dashed "Prints at 1:N · A4" outline on the map shows exactly what prints; with "Fit the drawing" it hugs the drawing (a lone bus prints at 1:500 or closer, not 1:1,500). Picking a scale in Print scale resizes the outline and the PDF matches it.

**Last verified**:

#### PRK-15 — Vehicles look like what they are

**Do**: Add each vehicle type.

**Expect**: Buses show a windscreen, mirrors and roof units; "+ trailer" buses (EU/UK 18.75 m, US 19 m) a drawbar and a separate trailer; the EU artic a flat-fronted cab and a ribbed box trailer; the US truck a long hood, cab and sleeper; the splitter a van and its trailer. A name too long for the vehicle sits beside it, not across its ends. Two markers dropped in a row land side by side, labels apart.

**Last verified**:

#### PRK-13 — The scale on paper is true

**Do**: Print the PDF at 100 % (no "fit to page"); measure the scale bar and a bus with a ruler.

**Expect**: Both match the stated 1:N (e.g. at 1:500 a 13.5 m bus is 27 mm).

**Last verified**:

## 3D

#### PRK-16 — The 3D view, to scale

**Do**: On a map, switch **Plan | 3D**.

**Expect**: Google's 3D city loads around the venue with every vehicle as a true-size block model (buses with roof units and trailer, artic cab + box, US hood + sleeper…), standing on the road, labelled with its length; routes and areas lie on the ground; markers show through roofs. Drag moves, right-drag / Ctrl-drag tilts and turns, scroll zooms. Google's credit line shows bottom left. A 4 m bus is visibly the height of a single-storey building beside it.

**Last verified**:

#### PRK-17 — Use this view for the PDF

**Do**: In 3D, frame the approach; press **Use this view for the PDF**; Export PDF.

**Expect**: "Saved" toast; the PDF has a page 2 — the same view, titled "… · 3D", Google credit bottom right, a note that perspective has no scale bar. Reloading and exporting again keeps the view. Without a saved view, page 2 looks at the drawing from the south-west-ish default.

**Last verified**:

#### PRK-18 — Trees and overhangs

**Do**: Park a bus under a tree or a canopy on the overhead plan; open 3D.

**Expect**: The bus stands on the road, not on top of the tree.

**Last verified**:

## Known broken

#### PRK-90 — Re-exporting makes a new file

**Do**: Export twice.

**Expect**: One PDF that updates, so a share link sent to a driver stays current.

**Currently**: Each export is a new file in Files › Parking maps (the parking map remembers the latest). Share the **folder** (Files › Parking maps › Share…) to give drivers a link that always has the newest.

**Tracked in**: feat/parking-maps follow-up.
