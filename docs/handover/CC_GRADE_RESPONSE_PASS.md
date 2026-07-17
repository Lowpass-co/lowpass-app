# CC — GRADE RESPONSE PASS. Adam's live grading (2026-07-13) → fixes. Staged, bank-per-stage, SINGLE OWNER.

Source: Adam's full live-tool export (44 verdicts + cons). Two tracks: **G1 = unambiguous fixes** (this doc, CC executes now) · **G2 = design-gated surfaces** (Cowork mocks → Adam grades → build specs follow; do NOT improvise these). Verify-before-claim; screenshots per changed surface; floor + money greps per bank; `/api/debug/derivations` remains the ground-truth probe.

**Precondition question (ask Adam first, blocks several items):** were migrations 237 + 226 re-pasted after the schema-drift discovery? `routing.venue_frozen_at` / `canonical_venues.address` must exist before venue tooltips/footer-city work. If not pasted, post both SQL again and wait.

## G1-A — Broken things (bank each, in this order)

1. **Budget "+ Add line" is extremely slow then RELOADS the page.** The no-reload class again (unguarded form submit or router.refresh). Root-cause in one sentence, fix, and grep the budget toolbar for siblings. Also kills: the reload makes the grid lose position.
2. **Files page is dead** — "no menu, no way of editing or viewing." Diagnose why the hub renders nothing (loader? gating?), then implement the F2 treatment now: DataTable + Upload button + drag-drop + invitation empty state. This was graded fail as *broken*, not just unpolished.
3. **Advance category (section) reorder still glitches** — line reorder works, section reorder doesn't. The B2 drag fix evidently covered fields only. Root-cause (likely same duplicate-key class), fix, prove with a 5-section reorder.
4. **Advance default template flow (ADV-51 fail):** there is no default template, so Start seeds nothing. Implement Adam's spec verbatim: if a tour has no default advance template, prompt "Build one for the whole tour, or skip" → builder saves as tour default → auto-assigns to all shows. AND: advances must be startable on ANY day type (day off / travel / rehearsal / radio), not just shows — remove the show-only gate everywhere (list rows, invitation, counts stay show-based for readiness but any day can open one).
5. **Advance venue-entry form missing** — "the links work, the form doesn't." Reproduce the full intake path with a real link on production; if the public intake page lacks the venue-info form, the INTK-02 claim was false — say so and fix. Also surface where a TM edits Venue Info inside the advance day (the rail shows VENUE SPECS but no edit path).
6. **Advance "Export advance" button is not visible.** It must sit beside Send Packet with the same customization pattern (one show / multi-show) as other exports.
7. **Payroll rate-type not editable** (CR-02): restore/implement rate-type editing per row (the SSOT writeRates path supports it — this is UI).
8. **Rider override = dead page**: overriding a channel list opens the rider builder which has NO channel-list section/option — the edit path is a dead end. Wire override to open the channel-list editor for channel-list-kind packs (kind-aware routing), not the generic rider builder.
9. **Artist-level rider access missing**: from tour Production there is no path to the artist masters, and artist-vs-tour scope is invisible. Add: scope chips (artist ↘ / tour) on every pack row + "View artist masters →" link from tour Production → artist Production tab. (Full IA clarity is a G2 design item; this link + chips are the immediate unblock.)
10. **Venue search searches only after Enter** and leads with "create 'x' as new venue". Fix: debounced search-as-you-type; results first, create-new LAST. (Design standard: suggestions ≥1 char, 250ms debounce.)
11. **Stage-plot channel assignment undiscoverable** (SP-05): expose the link-channels control on item selection (the FK path exists); inline-editable channel numbers on items.

## G1-B — Polish sweep (one bank)

12. **Emoji sweep round 2:** budget toolbar (delete line 🗑, search 🔍), days-matrix search, and a full re-grep of emoji ranges in JSX — round 1 provably missed toolbars.
13. **Mono sweep round 2:** Budget grid numbers (est/act/var — Adam: "numbers aren't mono in the budget"), Payroll money, remaining tables. Grep for money-rendering components not using --lp-font-numeric.
14. **Stale label:** budget derived chip says "from Operations" — that menu no longer exists; label by source surface ("from Payroll", "from Rooming").
15. **Popover positioning:** fingerprint/routing popovers OVERLAP the strip/columns and block clicks (TR-03 fail, G-07 change). Flip above/below the anchor with collision detection (the tail pattern), never covering the anchor row; popover must not intercept clicks meant for the cell.
16. **Duplicate picker on Budget:** the page shows artist+tour pills AND a second "pick an artist" prompt above. One picker. (Full header standardization is G2; kill the duplicate now.)
17. **Venue-link chip tooltip:** the linked-venue indicator explains itself on hover ("Linked to canonical venue — edits propagate until show day").
18. **Riders landing rows:** scope chips + "never sent" instead of "—" (the LT-02 remainder).

## G1-C — Keyboard standard (one bank, app-wide interaction contract)

Adam's rule, now law: **Tab ALWAYS moves to the next entry point** (never traps in menus/grids); **arrow keys** navigate within lists/grids/menus; **Enter selects**; Esc exits. Audit the offenders he hit (routing grid menus, day-type dropdown, pickers) and land a `docs/design-tokens.md` §keyboard note so future components inherit the contract. Smoke KEY-01..03.

## G2 — DESIGN-GATED (do not build; Cowork mocks these for Adam's grading first)

- **Payroll grid rethink** — "needs substantial work… day rate vs show/off/rehearsal confusing; editable cells not obvious; rethink the layout." 
- **Days-matrix redesign** — boxes too small, city invisible, routing formatting overflows.
- **Patch mode v2 — the matrix** — Adam: grid matrix, inputs along top, channels left, click a box to assign, **click-drag in a line for sequential multi-assign** (dLive/LV1 grammar). Current socket strips stay until the matrix ships.
- **Standard identity header + picker** — artist/tour name "changes size/format/location on every single menu; 0 consistency." One component, every page; artist-tier picker reimagined for the new IA (currently always empty there); artist Home reachable from every artist tab.
- **Artist tour-row polish** — fingerprint cramped/dates merging at row scale; hover affordance (rows must look clickable).
- **Stage-plot inspector overhaul** + export-shell parity for stage plot + advance PDFs (SP-06, EX-01).

## Report format
Per item: root cause (one sentence where it's a bug), files+lines, screenshot, smoke ID. The Cowork session re-walks and re-runs Adam's failed IDs. G2 mockups arrive from Cowork separately.
