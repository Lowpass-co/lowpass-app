# Pipeline smoke index — run at pipeline end (2026-07)

Consolidated checklist for the post-master-sprint pipeline (P1–P8). Built by the
Cowork operator so the whole thing can be smoked in one pass at the end rather
than per-surface. **Grade each ID `pass` / `fail` / `change` and report by ID.**

- Section 1 = the pipeline's own deliverables (this is what changed — run all of these).
- Section 2 = money/data invariants that must not move (harness — re-run, don't eyeball).
- Section 3 = full regression suite index (go deeper here if a Section 1 area smells off).

Status legend: ✅ shipped & banked · 🔨 in progress · ⏳ not built yet.
Annotation tool Adam likes: `docs/design/SMOKE_TOOL_2026-07.html` (pins + tri-state verdicts + markdown export); `docs/smoke-tests/walkthrough.html`.

---

## Section 1 — Pipeline deliverable smokes

### P1 — Venue SSOT ✅ (origin/main e78d70b)
Source: `docs/smoke-tests/venues.md`. VEN-01..05 are the older canonical-LINKING tests; VEN-06..10 are this pipeline's resolve/freeze behavior.

- [ ] **VEN-06** — Edit a canonical venue → an UPCOMING routing row that references it reflects the edit.
- [ ] **VEN-07** — A PAST/frozen routing row does NOT change when its canonical venue is edited (no history rewrite).
- [ ] **VEN-08** — A LIVE advance day renders the current canonical venue value (not the value captured at advance-creation).
- [ ] **VEN-09** — On-read freeze: first load of a routing row after its show day passes writes the snapshot into `venue_*` + stamps `venue_frozen_at`.
- [ ] **VEN-10** — Documents that leave the building resolve live/frozen: regenerate a packet PDF / routing export for an upcoming linked show → shows the edit; for a past/frozen show → shows the snapshot, not current canonical.

### P2 — Design Sprint A: foundations + views 🔨 (Stage 0 ✅ 3e68bd8; Stage 1 views in progress)
Source: `docs/smoke-tests/visual.md`. Design IDs are graded BY EYE. `locked` = must match graded mockup · `changed` = new requirement wording · `new` = added from feedback.

Global (Stage 0):
- [ ] **VIS-G-01** — Hue budget: orange=act/attend/selected, green=done/positive, red=destructive+negative variance; day-type hues only in strips/pill-ticks (desaturated); ≤2 accent hues per screen + the strip.
- [ ] **VIS-G-02** — All numerics (dates, times, money, counts, distances, phones) in JetBrains Mono via `--lp-font-numeric`.
- [ ] **VIS-G-03** — Zero emoji anywhere; icon set only. *(Operator ruling: closes at design-pass END — tool-surface emoji ride P3–P5; view/neutral surfaces clean now.)*
- [ ] **VIS-G-04** — Persistent artist + tour picker pills in the top bar on every tier; real user avatar; Spotify artist images where an artist appears.
- [ ] **VIS-G-05** — Autosave + SaveStatus pill everywhere; no Save buttons, no ⌘S.
- [ ] **VIS-G-06** — Motion: 150–200ms ease-out, staggered entrances, one-time count-ups, popovers scale from anchor with tail, max one looping animation (in-progress pulse), reduced-motion kills all.
- [ ] **VIS-G-07** — Popover-from-the-element on every hover detail (fingerprint pills, all sizes).
- [ ] **VIS-G-08** — Review grammar (old value struck → new, per-row ✓/✕, explicit apply) for AI extraction, venue intake, and settlement conflicts.

Workspace (Stage 1):
- [ ] **VIS-WS-01** — Cards carry Spotify hero images (not tint blocks/initials).
- [ ] **VIS-WS-02** — Status lines = verb + time anchor, derived from routing.
- [ ] **VIS-WS-03** — Footer standardized: left `Next: <date> · <city>` (or "Nothing booked"), right derived action verb; same shape every card.
- [ ] **VIS-WS-04** — "Needs you" queue (rule-generated) instead of activity feed.
- [ ] **VIS-WS-05** — No aggregate money stat on the workspace.

Artist (Stage 1):
- [ ] **VIS-AR-01** — Hero header with artist imagery + Tours/Production/Business tabs.
- [ ] **VIS-AR-02** — Current + future tours equal visual weight, date-ordered; past collapsed to one settled line.
- [ ] **VIS-AR-03** — Tour rows: name, dates, fingerprint w/ week-commencing markers, one status line. No readiness chips on rows.
- [ ] **VIS-AR-04** — Business tab: lock icon + tooltip explaining manager-only visibility.

Tour landing / Routing (Stage 1):
- [ ] **VIS-TR-01** — Routing is the tour landing; no Overview page.
- [ ] **VIS-TR-02** — Readiness rail de-boxed: one hairline-divided strip, not four cards.
- [ ] **VIS-TR-03** — Hero day strip: muted hues, mono day numbers, next show outlined, hover popovers, click → grid row / advance.
- [ ] **VIS-TR-04** — Grid columns: # · DATE · DAY · VENUE · CITY · **ADDRESS** · NOTES · TRANSIT (single method icon; time/distance in interstitial chips only).
- [ ] **VIS-TR-05** — Drive chips as neutral mono interstitial rows.
- [ ] **VIS-TR-06** — Grid full-height scrollable (no "N more days" footer); tab-through auto-scrolls; day cell tabbable + type-searchable; two day types stack a second tick.
- [ ] **VIS-TR-07** — Nav: Routing | $ Budget · ⧉ Advance | Crew · Production · Files.

### P3 — Advance decomposition (Build / Advance / Share) ⏳
- [ ] **VIS-AB-01** — Modes named Build / Advance / Share, segmented switcher, template context beside it; breadcrumb includes the show.
- [ ] **VIS-AB-02** — Section picker = LEFT rail; block editor centre; drag-reorder works (bug fixed).
- [ ] **VIS-AB-03** — Selection-driven inspector: field label/type (12 types)/required/tm-only/venue-can-fill; section status/assignee/intake exposure.
- [ ] **VIS-AB-04** — Deal-memo: upload attaches a document line + Review button per day; review is a modal; batch-review lists pending packs.
- [ ] **VIS-AB-05** — "Venue can fill x of y" visible per section while building.
- [ ] **VIS-AB-06** — Saving a template prompts apply-to-tour / selected-shows.
- [ ] **VIS-AB-07** — Flag icon has a tooltip explaining the flag/comment workflow.
- [ ] **VIS-AA-01** — Section rail with mono fill counts; pulsing dot only on active in-progress section.
- [ ] **VIS-AA-02** — Intake banner ("venue filled N fields · when") expands to Review-grammar queue; click-through shows exactly what they entered.
- [ ] **VIS-AA-03** — Inline click-to-edit with orange focus border; Tab next; Esc revert; autosave.
- [ ] **VIS-AA-04** — Status dots orange/green/gray only.
- [ ] **VIS-AS-01** — Venue-view preview shows tm-only sections AS hidden (dimmed, eye-off), never omitted; never-clobber rule stated in words.
- [ ] **VIS-AS-02** — Intake link card: mono token, Copy/Revoke, expiry preset ("day before show"), fillable count, password toggle revealing passphrase.
- [ ] **VIS-AS-03** — Packet: no duplicate "with input list" line; custom attachments (logos, financial info, hire lists); honest gaps labeled.
- [ ] **VIS-AS-04** — Primary button = "Export advance", one show or multiple, styled by the shared export shell.
- [ ] **VIS-AS-05** — Activity log with mono timestamps (opened / submitted / downloaded).

### P4 — Budget parity + Channel list + Patch mode ⏳
- [ ] **VIS-BG-01** — Version bar: mono draft chip, approved lineage, Approve action; all version actions via SQL RPCs.
- [ ] **VIS-BG-02** — Derived rows: lock glyph + neutral "↗ from <source>" chip + hover tooltip naming where edits live.
- [ ] **VIS-BG-03** — Computed sections: `ƒ` chip + formula text, visually distinct, no editable rows.
- [ ] **VIS-BG-04** — Vendor + Day columns present (day pill + tick).
- [ ] **VIS-BG-05** — Variance: green favourable, red unfavourable.
- [ ] **VIS-BG-06** — Prominent "+ Add line" in toolbar + ghost row per custom section.
- [ ] **VIS-CL-01** — Inheritance banner offers BOTH: Override here, and Edit original with "reflects across all inheriting shows" warning.
- [ ] **VIS-CL-02** — Stage-box stripes desaturated, legend in footer; label reads "Stage box".
- [ ] **VIS-CL-03** — Phantom = neutral filled/empty toggle dot.
- [ ] **VIS-CL-04** — Outputs sub-grid, independent numbering, stereo badges.
- [ ] **VIS-CL-05** — Ownership chips: owned / rented (orange) / venue supplies.
- [ ] **VIS-CL-06** — Sub-snake and Gain columns present; channel-number gaps explained by grouping.
- [ ] **VIS-CL-07** — Patch mode: toolbar toggle → socket strips per box/snake, click-channel-click-socket (or drag), conflicts highlighted, "patch in order" bulk action, keyboard cursor.

### P5 — Stage plot + Rider + Export shell ⏳
- [ ] **VIS-SP-01** — Canvas dominant, categorized icon rail left, inspector right.
- [ ] **VIS-SP-02** — Neutral item strokes; orange = selection only.
- [ ] **VIS-SP-03** — Linked-channel chips with stripe tick + number; visible both directions.
- [ ] **VIS-SP-04** — Power items NEUTRAL; power-type/amperage settings kept in inspector.
- [ ] **VIS-SP-05** — Channel numbers on items editable inline.
- [ ] **VIS-SP-06** — PDF export visually matches the canvas render.
- [ ] **VIS-SP-07** — All current customization controls survive, restyled.
- [ ] **VIS-RB-01** — Neutral ↘ inheritance banner naming the source pack + override count.
- [ ] **VIS-RB-02** — Section rail states: ↘ inherited / overridden chip / mono badge for embedded channel list.
- [ ] **VIS-RB-03** — Per-section override, in place, "master untouched", view-original + revert.
- [ ] **VIS-RB-04** — Source labels dynamic by scope: show-level "view tour original", tour-level "view artist original".
- [ ] **VIS-RB-05** — Field catalog expanded per `COMPETITIVE_ADVANCEWITHME_2026-07.md` §6 *(pending Adam's grading of the draft; shell-only is the sanctioned fallback)*.
- [ ] **VIS-EX-01** — One shared export shell: artist/tour lockup header, mono numerics, day ticks; consistent across advance, day sheets, stage plot, channel list, rider, budget.

### P6 — Labor calls ⏳
Source: `docs/handover/CC_LABOR_CALLS.md`. IDs land with the build.
- [ ] **LAB-01..04** — (to be authored in the P6 build) labor-call block, intake round-trip, day-sheet + /m/today render, templates apply-to-day.

### P7 — Intake upgrade ⏳
Source: `docs/handover/CC_INTAKE_UPGRADE.md`. IDs land with the build.
- [ ] **INTK-01..05** — (to be authored in the P7 build) prefill provenance, tech-pack extraction → Review queue, mobile single-column, reminder job no-double-send, per-link opt-out.

---

## Section 2 — Money & data invariants (harness — MUST NOT MOVE)

Re-run these; they are pass/fail by exact number, not by eye. A moved number is a hard stop.

- [ ] **Payroll harness 52/52** — exact: Richie 4610.63 · split 1606.62 · flat 2250 · rehearsal 500 · per-diem 90.
- [ ] **Income provenance harness 18/18** — settlement never clobbers manual actuals.
- [ ] **FX grep gates = 0** — no reintroduced hardcoded FX paths.
- [ ] **resolveVenue harness 18/18** — `node --experimental-strip-types src/lib/venues/resolveVenue.harness.ts` (live→canonical, past→snapshot).
- [ ] **Venue grep gate** — `grep -rnE "venue_name|venue_phone|venue_website|venue_capacity|canonical_venues" src/lib/export/ src/components/advance-packet/ src/app/api/advance-packets/ | grep -vE "\.select\(|interface|type "` → only resolver calls + type decls.
- [ ] **Floor** — `tsc --noEmit` 0 · `eslint` 0 · `next build --webpack` green (never Turbopack).

---

## Section 3 — Full regression suite index (deeper pass)

Per-product functional smokes (~360 IDs). Run the file for any Section-1 area that smells off.

| File | IDs | Scope |
|---|---|---|
| `advance.md` | 57 | Advance builder, intake, templates, deal memos |
| `grid.md` | 48 | Canonical `<Grid>` spreadsheet primitive |
| `budget.md` | 40 | Budget grid, income, versioning, FX, receipts |
| `operations.md` | 34 | Operations product surfaces |
| `channel-list.md` | 27 | Channel list editor, patch, inheritance |
| `stage-plot.md` | 17 | Stage plot canvas + PDF |
| `ai-usage.md` | 15 | AI metering + limits |
| `rag.md` | 11 | RAG index + retrieval |
| `venues.md` | 10 | Venue linking (01–05) + resolve/freeze (06–10) |
| `auth.md` | 9 | Auth flows |
| `home.md` | 7 | Workspace/home |
| `nav.md` | 7 | Nav & IA |
| `ui.md` | 6 | Shared UI primitives |
| `maps-cost.md` | 4 | Maps cost guard |
| `rooming.md` | MTX-01..09 | Rooming matrix (see `SMOKE_QUEUE.md`) |
| `riders.md` | RID-01..04 | Rider pack open/delete |
| `routing-rail.md` | RAIL-* | Routing rail |

Prior manual queue (grid sprint, may be partly stale): `SMOKE_QUEUE.md`.
Full walkthrough script: `FULL_WALKTHROUGH.md`.
