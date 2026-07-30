# Rackline → Lowpass Production. Integration plan (2026-07-22)

Rackline (`/Users/lowpass/Documents/rackline`) is a 19" rack planning tool: projects → racks → placements (devices/panels) → ports → cables, drawn as mm-true SVG elevations, with collision/clearance findings, weight/power/U totals, and vector PDF + XLSX export. 95 source files, ~12.7k lines, formal JSON-Schema 2020-12 model, no backend, single-user, file-based.

## The headline: this is two projects, not one

**Project A — put the editor on screen inside Production.** Mostly mechanical.
**Project B — move rack data from files into Lowpass's database and wire it to Assets.** This is the valuable part, and it's independent of how the editor gets on screen.

Doing A without B gives a drawing tool that happens to live in the same browser tab. Doing B is what makes a rack a first-class tour object.

## Recommendation: wrapper (iframe), not a port — for now

| Constraint (from the map) | Iframe | Native port into Next |
|---|---|---|
| **React 18.3.1** vs Lowpass's React 19 | isolated, no conflict | must upgrade Rackline to 19 and re-test everything |
| `import.meta.glob({eager:true})` in `deviceAssets.ts` — Vite-only | keeps working | **must be rewritten** before it compiles under Next at all |
| ajv compiles validators via `new Function` (needs `unsafe-eval`) | contained to the frame's CSP | forces `unsafe-eval` on the whole app, or precompiling ajv standalone |
| Global CSS: `:root` tokens, `*{box-sizing}`, `body{margin:0}`, bare `button{}` | cannot leak | must be scoped or it restyles Lowpass |
| Global keyboard capture (⌘S preventDefault, Delete, arrows, Escape) | contained | fights Lowpass shortcuts and slide-overs |
| `window.confirm`/`prompt` ×7, `position:fixed` modals, `100vh` | contained | each needs replacing with app UI |
| 6.5 MB initial bundle (5.4 MB eager SVG + 1.1 MB device JSON) | loads only when opened | needs chunking work regardless |
| Tauri desktop target | **survives** | **dies** — absorbing into Next ends the desktop app |

That last row is the decisive one and needs Adam's ruling (see Open Questions). Everything else says "iframe is cheaper"; the desktop question says "iframe or lose a product."

## Phase 0 — decide the data home (before any code)
A rack drawing is not a loose file; it belongs to an artist and usually a tour, must be visible to crew, and should feed the advance packet. So `.rackline.json` becomes a **row**, not a file.

Proposed: `rack_projects` (workspace_id, artist_id, tour_id nullable, name, schema_version, doc JSONB, created/updated) with the canonical 4-policy RLS. The `doc` is the existing validated project JSON verbatim — **do not shred the schema into tables**. Rackline's model is already formal, versioned (1.0.0–1.9.0) and round-trip-guaranteed; splitting it into relational tables would fork the schema and break its validator. One JSONB column, one migration, versioned by the field Rackline already maintains.

Artist-scope by default (racks outlive tours — the same rack does three tours), with an optional tour link so a tour's Production mode can show "racks on this tour."

## Phase 1 — the wrapper (Production → Racks)
1. **Build Rackline to static** (`vite build` → `dist/`) and serve it from Lowpass — either `public/rackline/` or a separate Vercel deployment on a subdomain. Subdomain is cleaner for CSP (`unsafe-eval` scoped to that origin only) and keeps deploys independent.
2. **New route** `/artists/[id]/racks` and `/operations/[tourId]/racks` → Production mode rail item **"Racks"** per `IA_CANONICAL_2026-07-21.md`. Renders the app shell + a full-height `<iframe>`. **Do this AFTER S-1..S-3 land** so it slots into the new shell rather than being re-homed later.
3. **postMessage bridge** — a small, versioned protocol, Lowpass as the host of record:
   - host → frame: `{type:'rackline:load', doc}` · `{type:'rackline:save-request'}`
   - frame → host: `{type:'rackline:ready'}` · `{type:'rackline:dirty', dirty}` · `{type:'rackline:doc', doc}` · `{type:'rackline:export', kind:'pdf'|'xlsx', blob}`
   - Origin-checked both ways. Host owns persistence; the frame never talks to Supabase.
4. **Rackline changes required (small, in its own repo):**
   - Guard the Tauri imports so browser/embedded mode doesn't import `@tauri-apps/api` at module scope.
   - Add an `embedded` mode: skip Landing, accept the doc via postMessage, route Save to the bridge instead of the File System Access API, suppress ⌘S preventDefault.
   - Keep the standalone/desktop paths intact — embedded is an additional mode, not a replacement.
5. **Autosave** on the host: debounce `rackline:doc` → PATCH the row. Rackline's undo stack stays in the frame; Lowpass stores versions if wanted later.

## Phase 2 — the actual prize: Rackline ↔ Assets
This is why the integration is worth doing, and no competitor has it. ATOM has assets and a stage plot; nobody turns a rack drawing into logistics truth.

- **Device library from Lowpass gear.** Rackline's bundled `pilot-devices.json` becomes a *fallback*; the embedded mode receives the workspace's real gear (which since S1 carries `weight_kg`, `dimensions_cm`, `value_amount`, `country_of_origin`, `customs_hs_code`) as library entries. You draw racks from kit you actually own.
- **Racks become containers.** A rack in Rackline maps to a **container** in Lowpass's Spaces model; its placements map to the gear items inside. Suddenly the rack drawing *is* the packing list.
- **Weights flow up.** Rackline already computes per-rack weight totals. Feed them into Assets' space/container rollups and the truck-weight number stops being hand-entered.
- **Manifests and carnet.** Rack contents → gear manifest → ATA carnet (the S1 Stage D export). A drawn rack produces customs paperwork.
- **Advance packet.** Rack elevation PDFs join the venue packet alongside stage plot and channel list — Rackline already exports vector PDF.
- **Channel list / patch — see the dedicated section below.** They are NOT the same object and must not be unified.

## Racks ↔ channel list: optional linkage through the stage box (Adam's ruling, 2026-07-22)

**Correction to an earlier draft of this plan, which called racks and the channel list "the same domain seen twice."** They are not. They are two independent tools that *may* meet at one shared object — the **stage box** — and each must remain fully usable when the other doesn't exist.

**The two independence requirements, both hard:**
1. **Patch the channel list without ever building a rack.** This is the common case today and must not acquire a rack dependency. The patch matrix keeps working exactly as it does now with zero rack data present.
2. **Build racks without a channel list.** Rackline ships standalone and as a desktop app where no channel list exists at all. Rack projects must never require one.

**Where they meet.** A stage box is a real physical thing that legitimately appears in both views: in the channel list it's where channels *arrive*; in a rack it's a *device occupying U space*. That single object is the only sanctioned join, and binding is **opt-in from either direction**:

- **From the rack:** adding an endpoint in Rackline offers "bind to a stage box from this tour's channel list" alongside the existing free-text external endpoint. Bound → the endpoint carries the Lowpass stage-box id. Unbound → it behaves exactly as Rackline does today.
- **From the channel list:** a stage box can optionally point at a rack placement ("IONIC 16 (A) lives in Rack 2, U14"). Unset → the channel list is unchanged.

Rackline's model already has the hook: `ExternalEndpoint` / `endpoints[]` exists precisely for "something outside this rack." A bound endpoint is that, plus an id. No schema fork — an added optional field, version-gated like every other Rackline change.

**What the link buys when it exists** (and only then):
- The cable schedule gets real destinations instead of free text — "Rack 2 patch panel U14 port 3 → IONIC 16 (A) socket 7".
- The patch matrix can show where a socket physically lives.
- A rack elevation can show which channels land in that box.
- Both drawings stay internally consistent because the stage box has one identity, not two.

**Design rules for whoever builds it:**
- **Neither side may hard-require the other.** No non-null FK. The binding is a nullable reference, and every read path renders correctly when it's absent.
- **The stage box is the only join.** Do not attempt to map Rackline ports to channel-list channels one-to-one — a rack has ports the channel list will never know about (power, network, internal patch) and the channel list has channels that never touch a rack.
- **No silent auto-binding.** Name-matching a rack device to a stage box is a *suggestion for review*, never an automatic link — same propose-then-approve grammar as receipts and intake.
- **Unbinding is safe.** Removing a link must leave both sides intact and functional, never orphan or delete the other side's data.
- This is **Phase 2 work at the earliest.** Phase 1 ships racks with zero channel-list awareness.

## Open questions for Adam
1. **Does the Tauri desktop app stay alive?** If yes → iframe, decided. If it's dead and Rackline exists only inside Lowpass, a native port becomes worth costing (bigger job, better seams, one React version).
2. **Artist-scoped or tour-scoped racks?** Recommendation: artist, with optional tour link.
3. **Rackline's device library vs Lowpass gear** — converge (Phase 2) or keep separate? Recommendation: converge, since it's the differentiator.
4. **Licence** — Rackline has no LICENSE file. It's yours, but if it ships inside a commercial product, add one.

## Housekeeping found in the map
- `data/` is **392 MB** on disk but only ~6.5 MB is imported (the rest is `__pycache__` and unreferenced folders). Don't copy the folder naively into anything.
- The committed build is a **6.48 MB single chunk** — dominated by the eager SVG glob. Iframing hides this from Lowpass's bundle, but it's still a slow first open; worth splitting the artwork out of the initial chunk regardless.
- No LICENSE, and `package.json` is `private: true` with no exports field — fine for iframe, needs work if ever consumed as a library.

## Sequencing
Land the shell rebuild (S-1 → S-4) first — Racks needs a home to slot into. Then Phase 0 (one migration, Adam pastes), Phase 1 (wrapper + bridge; Rackline-side embedded mode is its own small piece of work in its own repo), then Phase 2 in slices, each independently useful.
