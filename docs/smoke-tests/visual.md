# Visual smoke tests — design system (2026-07)

Source: mockup grading via `docs/design/SMOKE_TOOL_2026-07.html` (export 2026-07-04) + chat-round verdicts. Status: `locked` = Adam passed the mockup, build must match · `changed` = updated per feedback, wording below is the NEW requirement · `new` = added from pin feedback. Run these against the built surfaces after each CC_DESIGN_PASS stage.

## Global (every surface)

- VIS-G-01 `locked` — Hue budget: orange = act/attend/selected, green = done/positive, red = destructive + negative variance, day-type hues only in strips/pill-ticks (desaturated). ≤2 accent hues per screen plus the strip.
- VIS-G-02 `locked` — All numerics (dates, times, money, counts, distances, phones) in JetBrains Mono via `--lp-font-numeric`.
- VIS-G-03 `new` — Zero emoji anywhere; icon set only.
- VIS-G-04 `new` — Persistent artist + tour picker pills in the top bar on every tier; real user avatar image; Spotify artist images where an artist appears.
- VIS-G-05 `locked` — Autosave + SaveStatus pill everywhere; no Save buttons, no ⌘S.
- VIS-G-06 `locked` — Motion: 150–200ms ease-out, staggered entrances, one-time count-ups, popovers scale from anchor with tail, max one looping animation (in-progress pulse), reduced-motion kills all.
- VIS-G-07 `locked` — Popover-from-the-element pattern on every hover detail (fingerprint pills, all sizes).
- VIS-G-08 `locked` — Review grammar (old value struck → new value, per-row ✓/✕, explicit apply) for AI extraction, venue intake, and settlement conflicts alike.

## Workspace

- VIS-WS-01 `changed` — Cards carry Spotify hero images (not tint blocks/initials).
- VIS-WS-02 `locked` — Status lines are verb + time anchor, derived from routing.
- VIS-WS-03 `changed` — Footer standardized: left `Next: <date> · <city>` (or "Nothing booked"), right derived action verb. Same shape every card.
- VIS-WS-04 `locked` — "Needs you" queue (rule-generated) instead of activity feed.
- VIS-WS-05 `changed` — No aggregate money stat on the workspace.

## Artist

- VIS-AR-01 `changed` — Hero header with artist imagery (current-app treatment) + Tours/Production/Business tabs.
- VIS-AR-02 `changed` — Current + future tours equal visual weight, date-ordered; past tours collapsed to one settled line.
- VIS-AR-03 `changed` — Tour rows: name, dates, fingerprint with week-commencing markers, one status line. No readiness chips on rows.
- VIS-AR-04 `new` — Business tab: proper lock icon + tooltip explaining manager-only visibility.

## Tour — Routing (landing)

- VIS-TR-01 `locked` — Routing is the tour landing; no Overview page.
- VIS-TR-02 `changed` — Readiness rail de-boxed: one hairline-divided strip, not four cards.
- VIS-TR-03 `locked` — Hero day strip: muted hues, mono day numbers, next show outlined, hover popovers, click → grid row / advance.
- VIS-TR-04 `changed` — Grid columns: # · DATE · DAY · VENUE · CITY · **ADDRESS** · NOTES · TRANSIT (single method icon; time/distance in interstitial chips only).
- VIS-TR-05 `locked` — Drive chips as neutral mono interstitial rows.
- VIS-TR-06 `changed` — Grid is full-height scrollable (no "N more days" footer); tab-through auto-scrolls; day cell tabbable + type-searchable; two day types stack a second tick.
- VIS-TR-07 `locked` — Nav: Routing | $ Budget · ⧉ Advance | Crew · Production · Files.

## Advance — Build

- VIS-AB-01 `changed` — Modes named **Build / Advance / Share**, segmented switcher, template context beside it; breadcrumb includes the show.
- VIS-AB-02 `changed` — Section picker is a LEFT rail; block editor centre; drag-reorder works (bug fixed).
- VIS-AB-03 `locked` — Selection-driven inspector: field label/type (12 types)/required/tm-only/venue-can-fill; section status/assignee/intake exposure.
- VIS-AB-04 `changed` — Deal-memo: upload attaches a document line + Review button per day; review is a modal; batch-review surface lists pending packs.
- VIS-AB-05 `locked` — "Venue can fill x of y" visible per section while building.
- VIS-AB-06 `new` — Saving a template prompts apply-to-tour / selected-shows.
- VIS-AB-07 `new` — Flag icon has a tooltip explaining the flag/comment workflow.

## Advance — Advance (per-day)

- VIS-AA-01 `locked` — Section rail with mono fill counts; pulsing dot only on active in-progress section.
- VIS-AA-02 `locked` — Intake banner ("venue filled N fields · when") expands to the Review-grammar queue; click-through shows exactly what they entered.
- VIS-AA-03 `locked` — Inline click-to-edit with orange focus border; Tab next; Esc revert; autosave.
- VIS-AA-04 `locked` — Status dots orange/green/gray only.

## Advance — Share

- VIS-AS-01 `locked` — Venue-view preview shows tm-only sections AS hidden (dimmed, eye-off), never omitted; never-clobber rule stated in words.
- VIS-AS-02 `locked` — Intake link card: mono token, Copy/Revoke, expiry preset ("day before show"), fillable count, password toggle revealing passphrase.
- VIS-AS-03 `changed` — Packet: no duplicate "with input list" line; supports custom attachments (logos, financial info, hire lists); honest gaps labeled.
- VIS-AS-04 `changed` — Primary button = **"Export advance"**, offering one show or multiple, styled by the shared export shell.
- VIS-AS-05 `locked` — Activity log with mono timestamps (opened / submitted / downloaded).

## Budget

- VIS-BG-01 `locked` — Version bar: mono draft chip, approved lineage, Approve action; all version actions via SQL RPCs.
- VIS-BG-02 `locked` — Derived rows: lock glyph + neutral "↗ from <source>" chip + hover tooltip naming where edits live.
- VIS-BG-03 `locked` — Computed sections: `ƒ` chip with formula text, visually distinct, no editable rows.
- VIS-BG-04 `locked` — Vendor + Day columns present (day pill + tick).
- VIS-BG-05 `changed` — Variance: green when favourable, **red when unfavourable**.
- VIS-BG-06 `new` — Prominent "+ Add line" in toolbar plus ghost row per custom section.

## Channel list

- VIS-CL-01 `changed` — Inheritance banner offers BOTH: Override here, and Edit original with "reflects across all inheriting shows" warning.
- VIS-CL-02 `locked` — Stage-box stripes desaturated, legend in footer; label reads "Stage box".
- VIS-CL-03 `locked` — Phantom = neutral filled/empty toggle dot.
- VIS-CL-04 `locked` — Outputs sub-grid, independent numbering, stereo badges.
- VIS-CL-05 `changed` — Ownership chips: owned / rented (orange) / **venue supplies**.
- VIS-CL-06 `new` — Sub-snake and Gain columns present; channel-number gaps visually explained by grouping.
- VIS-CL-07 `new` — Patch mode: toolbar toggle → socket strips per box/snake, click-channel-click-socket (or drag), conflicts highlighted, "patch in order" bulk action, keyboard cursor.

## Stage plot

- VIS-SP-01 `locked` — Canvas dominant, categorized icon rail left, inspector right.
- VIS-SP-02 `locked` — Neutral item strokes; orange = selection only.
- VIS-SP-03 `locked` — Linked-channel chips with stripe tick + number; visible both directions.
- VIS-SP-04 `changed` — Power items NEUTRAL; power-type/amperage settings kept in inspector.
- VIS-SP-05 `new` — Channel numbers on items editable inline.
- VIS-SP-06 `new` — PDF export visually matches the canvas render.
- VIS-SP-07 `new` — All current customization controls survive, restyled.

## Rider

- VIS-RB-01 `locked` — Neutral ↘ inheritance banner naming the source pack + override count.
- VIS-RB-02 `locked` — Section rail states: ↘ inherited / overridden chip / mono badge for embedded channel list.
- VIS-RB-03 `locked` — Per-section override, in place, "master untouched", view-original + revert.
- VIS-RB-04 `changed` — Source labels dynamic by scope: show-level says "view tour original", tour-level says "view artist original".
- VIS-RB-05 `new` — Field catalog expanded to advance-grade depth (blocked on advancewithme research).

## Exports (all tools)

- VIS-EX-01 `new` — One shared shell: artist/tour lockup header, mono numerics, day ticks; consistent across advance, day sheets, stage plot, channel list, rider, budget.
