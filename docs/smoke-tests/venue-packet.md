# Smoke — Venue packet (V1)

Adam's ruling: "Nobody wants to click round an app, they want a PDF of each thing
and then somewhere to enter their information." The advance **Share** surface
(`/advance/[tourId]/[routingId]/share` → `ShareSurface.tsx`) leads with a
downloadable PDF per artifact + one no-signup intake link; the portal is the
wrapper, the PDFs are the experience.

Format: see [README.md](README.md).

---

#### VP-01 — Share leads with per-artifact PDFs + intake CTA · *screenshot walk*
Artwork + condensed-title header (artist Spotify image, tour/show line). A
**Download the packet** grid with one card per available artifact, resolved
data-driven from `rider_packs`: each `kind='rider'` (production + hospitality by
title), each `stage_plot`, one channel-list card, and this show's day sheet. Then
a **prominent** orange-tinted intake CTA (the no-signup link, `SendPacketButton`).
Preview + activity drop to secondary. No dead boxes. Screenshots **1440 + 1920**.

#### VP-02 — one-click PDF per card ✅ **live**
Each card downloads an **existing branded** PDF (assembly, not new builders):
riders → `GET /api/rider-packs/[id]/pdf` (`packet-pdf-rider`); stage plot / channel
list / day sheet → the shell export routes, POSTed with default config → blob
(`packet-pdf-stage_plot` / `packet-pdf-channel_list` / `packet-pdf-daysheet`).
One click = one download; no template-editor modal.

#### VP-03 — rider PDF AI import (propose → approve) ✅ **live · metered**
In the rider builder, **Import from PDF** (`rider-import-toggle`) → choose a PDF
(`rider-import-file`) → **Extract rider** (`rider-import-extract`) → Claude
proposes sections in `<ChangeReviewQueue>` (per-section accept/reject) → **Add**
creates the accepted sections through the **existing** `createSection()` path.
Nothing auto-writes ("AI drafts, you approve"); the route
(`/api/rider-packs/[id]/extract-rider`) is `withAiUsage`-metered (per-user cap →
workspace budget) with a 3s debounce, exactly like deal-memo / tech-pack. No new
table.

#### VP-04 — rider is ONE canonical record ✅ **verified**
The rider is a single `rider_packs` row (+ scope-chained `rider_sections`). It is
reachable from the **artist tier** (`/artists/[id]/(library)/riders`) and the
**advance** (Share rider cards' **Edit** link `packet-edit-rider` → `/rider-packs/[id]`;
the packet builder links the same). Both surfaces query the same table — editing
from either side edits the same record. No duplication.
