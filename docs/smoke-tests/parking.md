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

#### PRK-23 — Pick several things at once

**Do**: Click a bus, then ⌘-click (Ctrl on Windows) a second bus and a marker; Shift-drag a box round a row of buses; press ⌘A. With several picked: drag one of them, press → / Shift+→, press ] a few times, pick a colour, Duplicate, Delete, ⌘Z.

**Expect**: Each pick is outlined and the panel says "3 selected · 2 vehicles · 1 marker". ⌘/Ctrl- or Shift-clicking a picked item takes it out. Plain drag on the map still pans; Shift-drag draws a dashed box and picks everything it touches (adding to what's picked). Dragging any picked item moves them all; arrows nudge them all; ] turns them as ONE block (a row of buses stays a row, and it spins in place rather than drifting); colour paints only the vehicles; Duplicate parks a copy of the group beside it; Delete removes them all; each is one ⌘Z. The white turn knob shows only when a single vehicle is picked. A plain click on one of several picks just that one.

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

#### PRK-22 — A reload keeps everything where it was

**Do**: On a venue's map, place a marker exactly on a gate in the imagery and park a bus along a kerb; wait for Saved; reload (twice).

**Expect**: The marker is still on the gate and the bus still on the kerb, to within a few centimetres. Before the anchor-precision fix the whole drawing jumped tens of metres on reload.

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

**Expect**: The dashed "Page 1 · Plan · 1:N" outline on the map shows exactly what prints; at Fit it hugs the parking (a lone bus prints at 1:500 or closer, not 1:1,500; a long approach route doesn't zoom it out). Picking a 1:N for the page under PDF pages resizes the outline and the PDF matches it.

**Last verified**:

#### PRK-15 — Vehicles look like what they are

**Do**: Add each vehicle type.

**Expect**: Buses show a windscreen, mirrors and roof units; "+ trailer" buses (EU/UK 18.75 m, US 19 m) a drawbar and a separate trailer; the EU artic a flat-fronted cab and a ribbed box trailer; the US truck a long hood, cab and sleeper; the splitter a van and its trailer. A name too long for the vehicle sits beside it, not across its ends. Two markers dropped in a row land side by side, labels apart.

**Last verified**:

#### PRK-13 — The scale on paper is true

**Do**: Print the PDF at 100 % (no "fit to page"); measure the scale bar and a bus with a ruler.

**Expect**: Both match the stated 1:N (e.g. at 1:500 a 13.5 m bus is 27 mm).

**Last verified**:

#### PRK-20 — Colour a vehicle

**Do**: Select a bus; in Colour pick Teal; pick "A" (default); press ⌘Z.

**Expect**: The bus turns teal on the plan, in 3D and in the PDF key; "A" puts back its type's colour; one ⌘Z undoes one colour change. Duplicating a coloured bus keeps its colour.

**Last verified**:

#### PRK-21 — More than two pages

**Do**: Zoom out to show the approach; under PDF pages press **This plan view**, rename it "Approach", move it up; switch to 3D, turn the camera, press **Add this view as a page**; Export PDF.

**Expect**: The list shows Plan · Approach · 3D · 3D 2, and the map outlines each plan page's area ("Page 2 · Approach · 1:5,000"). The PDF has those four pages in that order, each titled, "Page n of 4" in the footer; plan pages have the key, notes and scale bar at their own scale; the first plan page frames the buses (not the whole approach route). **Show** on a page takes the editor to it; in 3D opened from a page, **Update "…"** re-aims that page. The last page can't be removed; there are at most 12.

**Last verified**:

## Venue drawings

**Prereq: migration 288 pasted.**

#### PRK-24 — Put a venue's drawing on the map

**Do**: Venue drawings → Add a venue drawing → pick (or upload) the venue's PDF. Crop round the car park; Next. Click both ends of a printed dimension (a 16 m bay), type 16; Check with a second dimension (the 24.08 m to the gate), type it; Next. Click a corner on the drawing, the same corner on the satellite; again for a second point far away; Done.

**Expect**: "The two agree within 0.6 %" (the bp pulse LIVE S2 drawing does); "The satellite agrees with the drawing within N %" (over 3 % says it may be out of date). The drawing's lines lie on the satellite at true size — a 13.5 m bus fits a 16 m bay with room to spare, an 18.75 m bus + trailer does not. Reload: it's exactly where it was. The panel says how it was set ("Scale from 16 m, checked 0.6 % · pinned · satellite 0.4 % agrees").

**Last verified**:

#### PRK-29 — Read it for me (AI)

**Do**: Add the S2 Truck Parking PDF; on Crop press **Read it for me**.

**Expect**: In ~15–30 s it lands on Scale with the crop round the car park and two printed dimensions drawn on their arrows (e.g. 24.08 m and 16 m), "The two agree within ~1 %". If the lines sit off the arrows or the two disagree by > 2 %, re-click them (the AI only proposes). A drawing with a north arrow offers "Place in the middle (north from the drawing)". Settings → AI limits shows the calls (parking.drawing.overview / refine), a few cents each.

**Last verified**:

#### PRK-25 — Indoor parking: the roof comes off

**Do**: On a venue whose trucks park inside (the Velodrom, a basement dock), set up its drawing and tick **Inside a building**; floor −5 for a basement. Park a truck on it. Open 3D.

**Expect**: The plan shows the drawing dark (white lines). In 3D the building's roof is cut away over the drawing and the drawing is the floor, at street height + the floor you typed; the truck stands on it at true size. The street outside is the normal Google city. The PDF's 3D pages show the same.

**Last verified**:

#### PRK-26 — Headroom

**Do**: Give the inside drawing a clear height of 3.8 m; park a 4.1 m truck on it. Separately, drop a Height limit marker with clear height 4.2 over a 4.4 m bus, and one on a route.

**Expect**: A Headroom box lists each ("Taller than the 3.8 m clear height inside …: Truck 1 (4.1 m)"); those vehicles are outlined red on the plan; the PDF key prints "Headroom — check before they go in". A Height limit marker drawn before this with "4.2 m" in its detail counts too.

**Last verified**:

#### PRK-27 — Levels

**Do**: With a basement drawing (floor −5), pick its level in the switcher under Plan | 3D; add a truck; pick Street; add a bus. Under PDF pages, set a plan page to the basement level; Export.

**Expect**: Things on the other level fade and can't be picked; the truck is saved on −5, the bus on the street (inspector → Level). The basement page prints only the basement's drawing and vehicles, its level named in the header.

**Last verified**:

#### PRK-28 — Next time at the same venue

**Do**: Open the parking map for another show at a venue that already has a map with drawings.

**Expect**: "Last time here (Mar 2026): S2 Truck Parking.pdf — already scaled and placed. Use it" — one click and it lands in the same real place (even if this map's pin differs). Satellite off (the checkbox) shows the drawings on a plain ground, and 3D shows them without the city.

**Last verified**:

## 3D

#### PRK-16 — The 3D view, to scale

**Do**: On a map, switch **Plan | 3D**.

**Expect**: Google's 3D city loads around the venue with every vehicle as a true-size block model (buses with roof units and trailer, artic cab + box, US hood + sleeper…), standing on the road, labelled with its length; routes and areas lie on the ground; markers show through roofs. Drag moves, right-drag / Ctrl-drag tilts and turns, scroll zooms. Google's credit line shows bottom left. A 4 m bus is visibly the height of a single-storey building beside it.

**Last verified**:

#### PRK-19 — Turn and tilt the 3D camera

**Do**: In 3D, right-drag (or Ctrl-drag) across the map; tap ↺ / ↻; hold ↻; tap ⌃ / ⌄; tap the compass.

**Expect**: Right-drag turns and tilts around what you're looking at (left-drag still moves, scroll zooms). ↺ / ↻ turn 15° per tap and keep turning while held; ⌃ / ⌄ tilt 10° (never flat, never past straight down); the compass needle shows north and a tap faces north. Arrow / bracket keys don't move things on the plan while in 3D.

**Last verified**:

#### PRK-17 — A 3D view on the PDF

**Do**: Under PDF pages press **Show** on the 3D page; frame the approach; press **Update "3D"**; Export PDF.

**Expect**: The 3D page in the PDF is that view, titled "… · 3D", Google credit bottom right, a note that perspective has no scale bar. Reloading and exporting again keeps the view. A 3D page never aimed looks at the drawing from the south-west-ish default (a view saved before pages existed is kept).

**Last verified**:

#### PRK-18 — Trees and overhangs

**Do**: Park a bus under a tree or a canopy on the overhead plan; open 3D.

**Expect**: The bus stands on the road, not on top of the tree.

**Last verified**:

## Driver links

**Prereq: migration 289 pasted.**

#### PRK-30 — Send a map to a driver

**Do**: On a drawn map: Send to a driver → "Bus 2 – Dave", 2 days, 20 3D views → Make the link. Copy; open it on a phone (not signed in).

**Expect**: The link shows once (Copy / Text it / Email); the list shows it live with its end time. The phone opens the plan (satellite, drawings, vehicles, routes) framed on what's drawn — drag, pinch, turn; Headroom warnings; Get there → Google Maps / Waze / Apple Maps directions to each gate; vehicles with sizes; notes. No app chrome, no sign-in.

**Last verified**:

#### PRK-31 — 3D on a driver link is capped

**Do**: Make a link with 2 3D views; on the phone tap Look around in 3D, back to Plan, again, back, again.

**Expect**: "Look around in 3D (2 left)" → 3D opens (touch hint: pinch / two fingers); then "(1 left)"; the third time "3D used up" — the plan still works. The owner's list shows 3D 2/2.

**Last verified**:

#### PRK-32 — Links end

**Do**: Turn a link off in the list; open it. Make a 12-hour link and open it after it ends.

**Expect**: "This link has been turned off." / "This link has expired — ask for a new one." — nothing of the map shows.

**Last verified**:

## Known broken

#### PRK-90 — Re-exporting makes a new file

**Do**: Export twice.

**Expect**: One PDF that updates, so a share link sent to a driver stays current.

**Currently**: Each export is a new file in Files › Parking maps (the parking map remembers the latest). Share the **folder** (Files › Parking maps › Share…) to give drivers a link that always has the newest.

**Tracked in**: feat/parking-maps follow-up.
