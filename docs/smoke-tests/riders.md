# Riders smoke tests

> Riders rebuild (Nov 2026, migration 301). A tour's rider is TWO documents —
> **Tech** and **Hospitality** — written like a page, published as numbered,
> dated versions, sent to each show as its own live link, read and answered by
> promoters at `/r/<token>`. ID prefix `RID`. RID-01…06 (the old builder) are
> retired below — never recycle an ID.
>
> **Paste migration 301 first** (after 300). Before it is pasted the Riders page
> 404s and the Overview simply says "Rider not made".

## Status snapshot (2026-11-26 — rebuild landed, needs-live)

| ID | Result | Note |
|----|--------|------|
| RID-07…RID-31 | **needs-live** | code + unit + PGlite verified; never run against a real Supabase |

---

## The page (Production › Riders)

#### RID-07 — A new tour starts from something

**Do**: Open a tour with no rider → Production › Riders.
**Expect**: Tech / Hospitality tabs; each empty tab offers "Start the tech
rider from": the starters for that document (headline / support), your saved
templates, another tour's rider, or **A blank page**. Picking one fills the page at once.
Opening the page wrote nothing (no rider row until you start).

#### RID-08 — It writes like a document

**Do**: Type a section heading, a paragraph (bold, a list, a link), then a
request line `(8) Guinness` — Enter for the next line, `24 x towels`, Enter,
Backspace on the empty line.
**Expect**: quantity and item split into their columns (8 · Guinness, 24 ·
towels); Enter makes the next line, Backspace on an empty one removes it;
pasting five lines makes five lines. "Saved" shows within a second of stopping.

#### RID-09 — Who provides it, alternatives, per person

**Do**: On a request line set Venue / Promoter / We bring; open ⋯ (Alternatives,
note, per person) — add "or Peroni", tick **per person**, set Touring party
on the Advance summary block.
**Expect**: the line reads "Or Peroni"; a per-person line multiplies by the
party (e.g. 2 per person × 12 → 24) and says so.

#### RID-10 — Advance summary builds itself

**Do**: Star (☆) three request lines across both documents; add an **Advance
summary** block.
**Expect**: it lists the starred lines grouped by section, counts worked out,
with "Touring party of N"; un-starring removes a line.

#### RID-11 — Attachments

**Do**: Add an **Attachments** block (Input list + Stage plot pre-ticked), add
a tour file.
**Expect**: names listed; after publishing, the promoter page links each one
(the input list / stage plot come back as PDFs; a file as a short-lived
download). Missing ones say "not attached yet".

#### RID-12 — Dated changes (hospitality changes, consoles swap)

**Do**: On a block → **Applies to…** → from 14 Dec. On another →
**Change from a show…** → pick a show date, edit the copy.
**Expect**: tags "From 14 Dec" / "Until 13 Dec" on the page; the original now
ends the day before and the copy starts on that show. A show before the date
sees the old wording; after, the new one — on its link and its PDF.

#### RID-13 — Reorder, duplicate, delete

**Do**: Drag a block by its handle; ⋯ → Duplicate / Move up / Delete.
**Expect**: the order sticks after a reload; nothing jumps for a second editor
watching (RID-15).

## Working together

#### RID-14 — Two people, one rider

**Do**: Open the same tour's Riders page in two browsers (two users).
**Expect**: avatars of who's here; the block the other person is in is marked
with their name; their edits arrive without a reload; a deleted block
disappears for the other person too.

#### RID-15 — A conflict doesn't lose anybody's work

**Do**: Both edit the SAME line within the same second.
**Expect**: the second save gets a banner on that block — keep **theirs** or
**mine** — never a silent overwrite.

#### RID-16 — Read-only member

**Do**: As a Member with Production VIEW (not edit), open Riders.
**Expect**: the draft reads as the document (no inputs, no Publish / Send); the
API refuses writes (403).

## Publishing and sending

#### RID-17 — Publish a version

**Do**: **Publish v1.0** with a note. Change a line, Publish again (minor).
Change nothing and try to publish.
**Expect**: 1.0, then 1.1; each dated; the Changes tab lists what changed
("Audio · (1) FOH table → (2) FOH table"); publishing with no change says
"Nothing has changed since version 1.1". A published version can't be edited
(the database refuses UPDATE).

#### RID-18 — Send writes the email; you send it

**Do**: **Send** → a show → Gmail (or Mail app, or Copy).
**Expect**: the email has the version, date, venue, what changed and the
show's own `/r/` link; Lowpass sends nothing itself. The Shows tab now says
"Sent v1.1" for that show; the rest say "Not sent".

#### RID-19 — Only the shows a change touches

**Do**: Publish a change dated for one show only, open **Send**.
**Expect**: only the shows this version changes are offered by default
("Show every show" widens it).

#### RID-20 — PDFs

**Do**: ⋯ → Download draft PDF; on `/r/<token>` → PDF.
**Expect**: the PDF reads exactly like the page (same layout), stamped
"Version X · date" and, on the promoter's, that show's venue / date and only
that show's lines.

## The promoter (`/r/<token>`)

#### RID-21 — Always the latest, with its number

**Do**: Open a show's link; publish a new version; reload.
**Expect**: "Version 1.2 · date" in the bar; **What changed** lists each
version's changes, newest first; only that show's lines (dated blocks
applied), never the draft.

#### RID-22 — "I've read it"

**Do**: Enter name / company → **I've read it**. Publish a newer version; on
the still-open page, acknowledge again.
**Expect**: "Version 1.1 acknowledged by …"; after a newer version the page
asks again and lists what changed since; acknowledging a page that's now stale
says a newer version was published — **Load it**.

#### RID-23 — Reply on a line

**Do**: **Reply on this line** under a request: "We have a K2 system".
**Expect**: the reply sits under the line; it lands in the TM's Replies tab
(live); the TM's answer shows under the line for the promoter. 60 replies /
link / hour, 20 acknowledgements — then a polite refusal.

#### RID-24 — Settle a line for a show

**Do**: In Replies, on a thread → Confirm / Substitute (with a note) / Cut,
then Resolve.
**Expect**: the promoter page (and that show's PDF) marks the line Confirmed /
"Substitute: …" / struck through — for THAT show only.

#### RID-25 — Dead and old links

**Do**: Open a revoked link; an unknown token; an OLD builder rider link; an
old builder CHANNEL-LIST share link.
**Expect**: "This link isn't active"; same; old rider → forwards to the tour's
whole-tour link if there is one and the old link had no password, else "This
rider has moved"; the channel-list link still shows its channel list.

## Around the app

#### RID-26 — Bring the old riders over

**Do**: As admin / manager, on any Riders page (or the artist's Riders library)
→ **Bring them over**. Click again.
**Expect**: tour / show packs join that tour's documents (a show pack dated to
its show); artist packs become templates tagged with the artist. Second click
brings nothing twice. The old rows are untouched.

#### RID-27 — Templates

**Do**: ⋯ → Save as a template…; on another tour → Start from → it. On the
artist's Riders library → Rename, Delete.
**Expect**: the template is a card marked "Your template"; rename / delete work
for admin / manager / Tour manager; a Member gets no menu.

#### RID-28 — Artist library

**Do**: Artist → Library → Riders.
**Expect**: each tour with its Tech / Hospitality chips and latest version
("Version 1.2 · 26 Nov" / "Not published yet" / "No rider yet"); chips open
that document (`?doc=`); templates listed, the artist's own first.

#### RID-29 — Overview "Needs you"

**Do**: Publish a version, don't send it; have a promoter reply.
**Expect**: tour Overview shows "N rider replies to answer" (→ Replies tab)
and "N shows haven't been sent rider version X.Y" (→ Shows tab); Production
line reads "Rider version X.Y, published …". Both counts match the Riders
page's own tabs.

#### RID-30 — ⌘K

**Do**: ⌘K → type the tour name or "hospitality".
**Expect**: "Riders & specs" group: the tour's riders (open that document) and
channel lists / stage plots (open their pages). No old builder packs.

#### RID-31 — Legacy show link (`/s/<token>`)

**Do**: Open an old show link for a tour that has published a rider.
**Expect**: Rider tab shows the current version for that show (same document
as `/r/`), with **Open the live rider ↗** when the team made a link; the old
builder rider is gone from the tab and the bundled PDF.

#### RID-32 — Input list + stage plot in the tech rider (migration 302)

**Do**: A tour with a channel list and a stage plot. Riders → Tech → start
from "Headline show — Tech" (or + Input list / + Stage plot on an existing one).
**Expect**: under "Input list & stage plot" the channel list shows as a table
(channel number first, the editor's own columns, "N inputs") and the plot as
a picture, each headed with its document name + version; hovering one shows
**Open the channel list → / Open the stage plot →**. No channel list yet →
"Make the channel list" and the promoter sees "The input list will follow." The two
blocks are not offered on the Hospitality document.

#### RID-33 — Click through to the tool, come back

**Do**: Click anywhere on the input list in the rider (hover shows "Open the
channel list →"); change a mic; press Back. Then click the stage plot.
**Expect**: the input list click lands on the tour's Channel list, the plot
click on that plot's own editor (same tab, ⌘-click = new tab). Back on the
Riders page the table shows the new mic within a moment (no reload); Changes
lists "Input list · Ch N Name: SM57 → Beta 57A"; Publish is enabled.

#### RID-34 — Frozen with the version

**Do**: Publish. Change the channel list again; don't publish. Open the show's
`/r/` link and download its PDF.
**Expect**: both show the PUBLISHED input list, not today's edit. After the
next Publish, only shows that read a changed list are offered for resending.

#### RID-35 — A show with its own channel list

**Do**: Channel list → attach a different list to one show ("Attach to show…").
**Expect**: editor + whole-tour link say "Different for: <date · venue>: <list
name>"; that show's own link shows ITS list; other shows the tour's. A Member
with Production VIEW sees the same (the copy is read server-side).

#### RID-36 — Outputs on / off

**Do**: On the Input list block untick "with outputs (IEM / mixes)".
**Expect**: the outputs table leaves the preview, promoter page and PDF;
Changes says "Input list — outputs left out".

#### RID-37 — Old attachments move into the rider

**Do**: A rider made before 302 with an Attachments block holding "Input list".
**Expect**: it reads "a PDF of the live channel list" with **Show it in the
rider**; clicking it adds the Input list block after it and removes the item
(the block goes when it was the last item). Attachments can no longer add a
new input list / stage plot item — tour files only.

#### RID-38 — The exact item: link → shop photo

**Do**: A hospitality line "Oat milk" → ··· → paste a product page link
(e.g. a supermarket's oat-milk page) → Tab out.
**Expect**: "Getting the shop's photo…", then a thumbnail on the line and in
the panel. A bare "tesco.com/…" gets https://. A shop that blocks robots says
so ("…add a photo yourself") and nothing breaks. A link to `localhost`,
`192.168.x.x`, `169.254.169.254` or an odd port is refused.

#### RID-39 — The exact item: upload a photo

**Do**: ··· → **Photo** → pick a 12 MB phone photo; then a PNG with a
transparent background; then a text file renamed `.jpg`.
**Expect**: the big photo arrives shrunk (long side ≤ 1600 px); the PNG keeps
its transparency; the fake is refused ("isn't a photo Lowpass can use") and
nothing is left on the line. Replace / Remove work; Backspace on an empty line
with a photo does NOT delete the line.

#### RID-40 — Promoter taps the item

**Do**: Publish; open the show's `/r/` link on a phone; tap "Oat milk".
**Expect**: a sheet with the photo, qty + item, alternatives / note, **See the
exact item ↗ <shop>** and **Reply on this line** (opens that line's reply
box). In the PDF the item name is a link to the shop page; no photos in the
PDF.

#### RID-41 — The PDF looks like a rider

**Do**: An artist with a logo (Artists › the artist › Edit profile → Logo).
Riders → ⋯ → Download draft PDF. Then remove the logo and download again.
**Expect**: each document opens on a cover — the logo large, the title, the
tour, the version stamp in orange italics, the opening paragraph, a numbered
contents list (each entry jumps to its section), the live link on a show's
PDF. Every page after the cover has the logo centred at the top and "Page x
of y" + the stamp at the foot. Section headings are centred capitals;
requests read "☐ (24) Still water"; a section with nothing in it (e.g. Key
contacts left empty) isn't printed or listed. Without a logo the cover sets
the artist's name in spaced capitals and the pages carry it small at the top;
the ⋯ menu offers "Add the artist's logo (heads the PDF)…". The PDF has
bookmarks for each section.

#### RID-42 — If possible on every line; per person only where it fits

**Do**: Open the details (the chevron) of a Tech line "DI box", a
Hospitality line "Bath towels", and a line under a "Catering" heading.
**Expect**: every line offers "if possible". "Per person" shows on the towels
and the Catering line, not on the DI box (a line already ticked per person
keeps its box). The details toggle is a chevron (˅ / ˄), never dots next to
the block's ⋮.

#### RID-43 — The printed contents says which page

**Do**: Download a published rider PDF with more than two sections.
**Expect**: each cover's Contents lists the sections with a dotted leader and
a page number; open those pages — each section starts there. Footer: "Page x
of y" left, "Generated with Lowpass" small in the middle, the version stamp
right.

#### RID-44 — The artist's logo everywhere; the name when there's none

**Do**: With a logo set (artist → Edit profile → Logo): open the rider editor,
the promoter link (/r/…), the show link's Rider tab and the PDF. Then on an
artist with no logo, open the rider editor and click "Add the artist's logo".
**Expect**: the logo heads every one of them (promoter page: also small in the
top bar). With no logo: the artist's name in its place everywhere, and the
editor shows "Add the artist's logo" beside it, which lands on the artist page
with Edit profile already open. "Generated with Lowpass" sits small under the
promoter page.

---


#### RID-45 — Starters say what a show really needs
**Do**: Production › Riders on a new tour → Start from a template. Open the
Headline Tech, Headline Hospitality, Festival Tech and Festival Hospitality
starters.
**Expect**: Headline Tech has a load-in request line and a Power section.
Headline Hospitality is laid out room by room (Artist room, Band room, Prod
office), then Showers & towels, If budget is tight, Catering. The two Festival
starters exist and are short — changeover, stage access, artist transport,
catering system — not a club rider with the word "festival" added.
## Retired (old builder — deleted in the Nov 2026 rebuild)

- RID-01 — Open a pack from the riders list (the pack list is gone).
- RID-02 — Editor identical on both routes (`RiderPackEditorView` is now the
  channel-list editor only; old rider URLs redirect).
- RID-03 — Delete a pack from the slide-over (deleted with the list).
- RID-04 — "Loading packs…" rail (`RiderPackSidebar` deleted).
- RID-05 — Create a new rider pack (`/api/rider-packs` now refuses kind
  'rider' — 410).
- RID-06 — Scope chips + artist-masters path (superseded by templates).
