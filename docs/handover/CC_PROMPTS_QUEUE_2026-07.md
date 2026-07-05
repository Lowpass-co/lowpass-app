# CC PROMPT QUEUE — every remaining session, pre-written (2026-07-04)

Authored by the Fable Cowork session at master-pass completion (`origin/main d77da2b`, verified 32/35). The thinking is DONE — these prompts encode it. The Cowork operator (see `COWORK_OPERATOR_HANDOVER.md`) pastes them IN ORDER, verifies each report, and applies the pre-made rulings. Do not reorder; the sequence encodes real dependencies (see `ROADMAP_2026-07.md`).

## GLOBAL RULES (apply to every prompt; repeat to CC only if it drifts)

- SINGLE OWNER per session. Cowork stays read-only on the repo while CC runs.
- BANK-PER-STAGE: gates green → commit → push `origin/main` before the next stage. Never push red. Honest early stops at stage/checkpoint boundaries are GOOD — resume prompts just name the remaining items.
- Migrations: hand-pasted by Adam. CC authors the file (idempotent, down-block, header comment, next free number ≥237 — CHECK THE TREE each time), posts the SQL in chat, STOPS until Adam replies "pasted."
- `231_payroll_drop_legacy_rate_columns.sql.HOLD`: NEVER applied or un-HOLDed. Requires Adam + a soak period. Any CC suggestion to apply it → refuse, escalate to Adam.
- Verify-before-claim: every report names files + line ranges; CC opens its own diff before reporting done.
- Capability beats cosmetics: the "DEPTH THAT MUST SURVIVE" lists (`DESIGN_DIRECTION_2026-07.md` §12) override any visual instruction. Conflict → stop and flag, don't simplify.
- Invariants that must never move: payroll harness 52/52 with fees.test.ts numbers exact (Richie 4610.63 / split 1606.62 / flat 2250 / rehearsal 500 / per-diem 90) · provenance harness 18/18 · fx grep gates stay zero.
- Floor gates always: `tsc --noEmit` 0 · `eslint` 0 · `next build --webpack` green (never Turbopack).

---

## P1 — VENUE SSOT (run order 2)

PRECONDITIONS: tree quiet; the 6 landed pipeline docs are still uncommitted (CC commits them first).

```
Read docs/handover/ROADMAP_2026-07.md — the master sprint is complete and verified; you are run order 2. First: commit the landed pipeline docs in one docs-only commit (docs/handover/{ROADMAP_2026-07,CC_VENUE_SSOT,CC_LABOR_CALLS,CC_INTAKE_UPGRADE}.md + docs/design/PERMISSIONS_MODEL_2026-07.md + the DESIGN_DIRECTION §13 edit). Then execute docs/handover/CC_VENUE_SSOT.md in full: migration (next free ≥237 — check the tree; post SQL, wait for my "pasted"), resolveVenue() + consumer conversion with the grep gate pasted (venue_* column reads only inside resolver + types + migrations), /venues edit UI with propagation notice listing affected upcoming shows, on-read freeze with venue_frozen_at. Free-text venues stay legal (FK nullable). Gates per the spec: floor, grep output pasted, scripted proof (edit canonical venue → upcoming routing row reflects it, past/frozen row doesn't, live advance render shows the edit), VEN-01..04 smoke IDs landed. Bank green commits per the push policy. Report, then STOP — the design pass is a separate invocation.
```

EXPECTED REPORT: docs commit hash · migration number + SQL posted + "pasted" confirmed · backfill match-rate stated · grep output verbatim · proof script output · files+lines · final origin hash.
OPERATOR VERIFY: (a) `grep -rn "venue_name" src/ --include="*.tsx" | grep -v resolveVenue` ≈ 0 outside types; (b) resolver file exists; (c) migration file has down-block; (d) VEN-* IDs in docs/smoke-tests/.
PRE-MADE RULINGS: fuzzy-match rate <60% on backfill → fine, unmatched stay free-text; do NOT build merge tooling. If a consumer can't use the resolver without behavior change → flag, skip, report.

---

## P2 — DESIGN SPRINT A: foundations + views (design stages 0–1)

PRECONDITIONS: P1 verified + banked. `docs/design/DESIGN_DIRECTION_2026-07.md` and `docs/smoke-tests/visual.md` are the contract.

```
Read docs/design/DESIGN_DIRECTION_2026-07.md IN FULL (it is the contract; CC_DESIGN_PASS.md is the sequencing), then docs/smoke-tests/visual.md (acceptance IDs). Execute design STAGES 0 and 1 this session, bank-per-stage.

STAGE 0 — foundations (one commit set, push before Stage 1):
- Motion tokens --lp-dur-{fast,base,slow} / --lp-ease-out in globals.css, documented in docs/design-tokens.md. Motion rules per DESIGN_DIRECTION §6 incl. prefers-reduced-motion kill-switch.
- EMOJI SWEEP: zero emoji glyphs in JSX anywhere (grep emoji unicode ranges); replace with the app icon set. Transport columns: ONE icon = method; time/distance stay in interstitial chips.
- Hue budget recolor per §2: in-progress status → orange, inheritance UI → neutral gray ↘, warnings → orange, phantom-power dots neutral, power items neutral. Day-type hues survive ONLY in strips + day-pill ticks (desaturate ~50% in strip rendering). Update token VALUES where possible rather than call sites.
- Real avatars: user profile image in top bar; Spotify artist images in pills/cards (the artwork fetch exists — find it, don't rebuild).
- Persistent artist + tour picker pills in the chrome on ALL tiers (workspace shows them contextual/empty).
- SaveStatus pill sweep: any remaining explicit Save buttons on autosaving surfaces → pill.
Acceptance: VIS-G-01..08.

STAGE 1 — views (commit per surface):
- WORKSPACE per §9 + VIS-WS-01..05: Spotify hero cards; standardized footer (left "Next: <date> · <city>" or "Nothing booked", right derived verb); "Needs you" queue rule-generated (advances untouched × days-to-rehearsal, ended-unsettled, unconfirmed crew × days-to-first-show); no aggregate money stat (deleted in the sprint — keep it dead); entrance staggers + fingerprint draw-in.
- Build <TourFingerprint> ONCE per §7 (three sizes, anchored popover-with-tail from the pill, click → routing row / advance day, week-commencing markers at tour scale, two-day-type stacking, wheel→horizontal, reduced-motion fallback) and mount at card scale here. This component is the app's signature — its quality bar is the interactive demos Adam graded.
- ARTIST per §9 + VIS-AR-01..04: hero header (current app's imagery treatment + Tours/Production/Business tabs), Business lock icon + "managers only" tooltip, all non-past tours equal weight date-ordered, past collapsed to one line, rows = name/dates/fingerprint(row scale)/status line — NO readiness chips on rows. "Library" wording dies; it's "Production" at both tiers.
- TOUR LANDING per §9 + VIS-TR-01..07: Routing IS the landing (Overview route dies if still present); de-boxed hairline readiness rail; hero fingerprint; grid gains Address column + single transit-method icon column; full-height scroll (no pagination footer); tab-through auto-scrolls; day pills = neutral chip + 3px tick, tabbable + type-searchable; day-type stacking.
Status vocabulary everywhere per §8 — verb + time anchor, derived, no mood words.

Gates per stage: floor + self-check the named VIS IDs (state pass/fail per ID in the report — Adam re-grades visually after). Do not touch tool surfaces (stages 2+). Report, STOP.
```

EXPECTED REPORT: per-stage commits · VIS-ID self-check table · fingerprint component path + mount points · what tokens changed vs call sites.
OPERATOR VERIFY: (a) grep emoji ranges in src → 0; (b) TourFingerprint component exists + ≥3 mount points; (c) Overview route gone; (d) grep "Library" in artist-tier components → 0 user-facing.
PRE-MADE RULINGS: if Spotify artwork needs an API scope the app lacks → placeholder initials stay, flag for Adam, don't block the stage. If a hue-budget recolor would change a token used by an unmigrated tool surface → scope the recolor to view tiers via wrapper class, note the debt.

---

## P3 — DESIGN SPRINT B: the Advance decomposition (design stage 2 — the monster, alone)

PRECONDITIONS: P2 verified. This is the highest-risk session in the queue; internal checkpoints are MANDATORY stop-points if context runs long.

```
Read docs/design/DESIGN_DIRECTION_2026-07.md §7/§10/§12 and docs/smoke-tests/visual.md (VIS-AB/AA/AS blocks). This session decomposes AdvanceSectionBuilder.tsx (6,054 lines) into three surfaces — Build / Advance / Share — per CC_DESIGN_PASS Stage 2. The §12 Advance must-survive list (12 field types, drag-reorder, templates + merge modes, intake never-clobber, deal-memo review-before-write, tm_only/status/assignee/flags, packet + password links) OVERRIDES everything: if a split step would drop one, stop and flag.

CHECKPOINT B1 — extraction skeleton: split along the SETUP/FILL seam (~line 1400) into three route-mounted surfaces with the segmented mode switcher (Build / Advance / Share) + shared state module; old URLs redirect; ALL existing behavior reachable (even if unstyled). Both bespoke debounce timers consolidated onto useAutoSave. Floor green → commit → push.
CHECKPOINT B2 — Build: left section rail + block editor + selection-driven inspector (field label/type/required/tm_only/venue-can-fill; section status/assignee/intake exposure "Venue can fill x of y"); 12-type field palette; FIX the section drag-reorder bug during extraction (the historical DnD console.warns mark the spots — remove them when fixed); template save prompts apply-to-tour/selected-shows (reuse existing merge code); breadcrumb includes the show; flag icon gets a tooltip. VIS-AB-01..07. Floor → commit → push.
CHECKPOINT B3 — Advance (per-day): section rail with mono fill counts + single pulsing in-progress dot; inline click-to-edit (keep read-view behavior); intake review banner → accept/reject queue (Review grammar per §7 — same component the AI review uses); day-strip navigator on top. VIS-AA-01..04. Floor → commit → push.
CHECKPOINT B4 — Share: venue-view preview (tm_only rendered AS hidden); intake link card (expiry preset "day before show", Copy/Revoke, password toggle revealing passphrase); packet builder — remove the "with input list" duplicate, add custom attachments (arbitrary files: logos, financial info, hire lists), page counts, honest gaps; button = "Export advance" wired to the existing export tool (single or multi-show); deal-memo flow = upload → document line + Review button → modal, plus an uploaded-packs batch-review list. VIS-AS-01..05. Floor → commit → push. Delete dead code (SettlementBlock, swallowed catches → real handling, leftover debug logs).

Stop at any checkpoint boundary if context runs long — never between. Report reached checkpoint + VIS self-checks + line counts of the resulting modules. STOP after B4 regardless.
```

EXPECTED REPORT: checkpoint reached · module map (old monolith → new files + line counts) · drag bug root cause + fix · VIS self-checks · what §12 items were touched and how they were preserved.
OPERATOR VERIFY: (a) AdvanceSectionBuilder.tsx gone or <500-line shell; (b) all 12 FIELD_TYPE_OPTIONS present in the new palette; (c) intake + review-grammar components shared with the AI path (one component, two callers); (d) grep "console.warn" in advance/ → ~0.
PRE-MADE RULINGS: mode naming is Build / Advance / Share — "Advance" inside the Advance product is intentional (Adam's call; breadcrumb disambiguates). If the seam split reveals server/client boundary issues → prefer server components for read paths, flag anything needing API changes rather than improvising new endpoints.

---

## P4 — DESIGN SPRINT C: Budget parity + Channel list + Patch mode (design stages 3–4)

```
Read DESIGN_DIRECTION §10/§12 + visual.md VIS-BG/VIS-CL blocks. Two stages, bank each.

STAGE 3 — Budget: bring Grid.tsx to Classic parity (vendor column, day-type pill+tick, duplicate-detection banner, phase grouping), THEN retire Classic (delete toggle + view; if Classic has ANY feature beyond the four named, port it first and say so). Version bar wired to the four SQL RPCs (approve/unlock/amend/rollback) — never client-side reimplementation. Derived rows: lock glyph + neutral "↗ from <source>" chip + hover tooltip naming the source surface. Computed sections: ƒ chip + formula text, visually distinct, uneditable. Red on unfavourable variance, green favourable. "+ Add line" in toolbar AND ghost row per custom section. Receipt drag-drop preserved. Keyboard footer identical wording to the house standard. VIS-BG-01..06. Floor → commit → push.

STAGE 4 — Channel list: restyle the bespoke editor (NOT SpreadsheetGrid): desaturated stage-box stripes + footer legend; "Stage box" label; phantom = neutral filled/empty toggle; ownership chips owned / rented(orange) / venue-supplies; add Sub-snake and Gain columns (schema check first — sub-snake data exists via box/metadata tables; if Gain needs a migration, author it, post SQL, wait for "pasted"); outputs sub-grid independent numbering + stereo badges preserved; channel-number gaps visually explained by grouping; inheritance banner with BOTH paths (Override here / Edit original + "reflects across all inheriting shows" warning). Fix the known clone-route bug (drops output/cable/gear columns on artist→artist copy). THEN PATCH MODE per DESIGN_DIRECTION §10: toolbar Patch toggle → socket strips per stage box/sub-snake (sockets show current assignment), unpatched channel queue left, click-channel→click-socket or drag to patch, conflicts highlighted, "patch in order" bulk action, keyboard cursor (arrows + Enter); patching writes channel_list_rows stage_box/row_index. Orange = selected channel/socket only. VIS-CL-01..07. Floor → commit → push. Report, STOP.
```

EXPECTED REPORT: Classic-parity feature checklist with evidence · what died with Classic · patch-mode data-write path · any Gain migration SQL · VIS self-checks.
OPERATOR VERIFY: (a) Classic view files deleted, toggle gone; (b) version actions call the RPCs (grep approve_budget_version etc. in the UI path); (c) patch surface writes only stage_box/row_index; (d) clone route now copies the 098/115 columns.
PRE-MADE RULINGS: if patch-mode scope balloons (e.g. needs a boxes-CRUD UI that doesn't exist) → build the minimal socket-strip read from existing box data, flag the CRUD gap; do NOT invent new tables. Venue-supplies chip: display state only if no schema field exists — if a migration is warranted, author + pause per protocol.

---

## P5 — DESIGN SPRINT D: Stage plot + Rider shell + Export shell (design stages 5–7)

```
Read DESIGN_DIRECTION §10/§11/§12 + visual.md VIS-SP/VIS-RB/VIS-EX blocks. Three stages, bank each.

STAGE 5 — Stage plot: restyle canvas chrome to system (neutral item strokes; orange = selection ONLY; power items NEUTRAL — keep power-type/amperage inspector settings intact). Channel numbers on items editable inline. Keep EVERY existing customization control, restyled (§12: icon grammar v2, snap + auto position labels, FK channel links multi-per-item, layers). PDF export re-skinned to match the canvas render 1:1. The per-item deprecated `scale` field gets NO UI. VIS-SP-01..07. Floor → commit → push.

STAGE 6 — Rider: finish PackEditor → RiderBuilderShell migration and DELETE PackEditor (it is @deprecated past deadline; it is still mounted at tours/[id]/rider-packs/[packId] and as the channel_list fallback in RiderPackEditorView — repoint both). Inheritance banners with DYNAMIC parent labels ("view tour original" at show scope, "view artist original" at tour scope). Section rail states (↘ inherited / overridden chip / mono badge for embedded channel list). Per-section override in place, "master untouched", view-original + revert. Blocks visibly heterogeneous with micro-labels. Field catalog: if Adam has graded COMPETITIVE_ADVANCEWITHME §6, implement the surviving catalog as section blueprints; if not graded yet, build the shell + keep the 13 existing blueprints, flag catalog as pending. VIS-RB-01..05. Floor → commit → push.

STAGE 7 — Export shell: one shared PDF shell (artist/tour lockup header, mono numerics, day-type ticks) adopted by advance export, day sheets, stage plot, channel list, rider, budget exports. Reskin the Puppeteer pipeline, do not rebuild it. One re-export per document type compared against its on-screen source in the report. VIS-EX-01. Floor → commit → push. Report, STOP. THE DESIGN PASS IS COMPLETE — say so explicitly and list any VIS ID you could not satisfy.
```

OPERATOR VERIFY: (a) PackEditor.tsx deleted, zero importers; (b) grep bg-emerald/bg-gray in stage-plot + advance → 0; (c) export shell module imported by ≥5 export paths; (d) VIS self-check table complete.
PRE-MADE RULINGS: rider catalog ungraded → shell-only is the correct scope, not a failure. Export parity conflicts (print vs dark theme) → exports print LIGHT with the same lockup/typography; "match the render" means layout/hierarchy, not dark background on paper.

---

## P6 — LABOR CALLS (run order 4)
```
Execute docs/handover/CC_LABOR_CALLS.md in full. Migration (next free 2xx, post SQL, wait for "pasted"). The section block registers into the DECOMPOSED Advance builder as a typed block (like MealTimes). Intake round-trip through the Review grammar. Day sheet + /m/today rendering. Templates artist/tour-scoped, apply-to-day additive. Do NOT wire into payroll rate_lines. Gates + LAB-01..04 per the spec. Report, STOP.
```
OPERATOR VERIFY: labor_calls migration idempotent · block registered in builder registry not hardcoded label-match · intake fillable + never-clobber.

## P7 — INTAKE UPGRADE (run order 5)
```
Execute docs/handover/CC_INTAKE_UPGRADE.md in full. Prefill via resolveVenue + last same-venue advance (proposals, confirm-per-section, counts as venue-submitted). Tech-pack upload → extraction endpoint (reuse deal-memo pattern, withAiUsage metering) → Review queue; failure degrades to the form, never a dead end. Mobile-first single-column intake pass with per-field "saved". intake_reminders + scheduled job (say what you chose), T-14/7/3 emails + completion ping, per-link opt-out — smallest possible, do not generalize. Migration SQL → pause for "pasted". Gates + INTK-01..05. Report, STOP.
```
OPERATOR VERIFY: extraction endpoint metered · prefill provenance marked · reminder job idempotent (no double-sends — check sent_at guard).

## P8 — HYGIENE PASS (run order 6, last)
```
Execute docs/handover/CC_HYGIENE_PASS.md in full, with updates: the SlideOver sweep's "top 5 first" now extends to every slide-over the design pass did NOT already convert (list what remains after your sweep); CLAUDE.md corrections now ALSO include: master pass + design pass completion state, the new nav/IA reality (Routing landing, Build/Advance/Share modes, Production naming), the venue resolver rule (no direct venue_* reads), and the prompt-queue/roadmap doc locations. Dedupe formatting helpers behavior-preserving. Delete TourBreadcrumb. Gates per the spec. Report, STOP. THE PIPELINE IS COMPLETE.
```
OPERATOR VERIFY: CLAUDE.md diff read in full (it steers every future agent — this is the one file where the operator reads every changed line) · zero-importer proofs pasted for deletions.

---

## AFTER P8
Operator: update ROADMAP statuses to complete, mark the task list done, and hand Adam a closing report: what shipped, the full smoke index, `231.HOLD` status (still HOLD — Adam decides post-soak), and the unscheduled items (permissions build, notification lane generalization, advance↔production data subscriptions, pricing).
