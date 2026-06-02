# CC Sprint 12 — Phase 2 (QR generation) + §6/§7 mockup re-post

Phase 1 (migrations 091–095) is applied in prod and verified green:

- `rental_inventory.qr_token` populated on every row (0 missing)
- `workspace_id` populated on all three rental tables (0 missing each)
- `rental_movements` table live with RLS enabled
- All five rows recorded in `public._lp_migrations`

You can proceed on the assumption that the schema is real. Don't re-verify by re-running migrations.

---

## Two parallel tracks in this prompt

**Track A — §6 + §7 mockups.** You reported these as "posted for sign-off" but they never landed in my chat. Re-post them inline in your next reply. Plain text descriptions + ASCII/markdown wireframes are fine — no separate file. Adam reviews async on his flight; sign-off can lag the §2 work without blocking it.

**Track B — §2 QR generation.** Start now. This is the meat of the next CC session.

Don't fragment §2 into multiple commits. One commit at the end of §2, same hygiene rules as Sprint 11.

---

## Hard rules

1. Single feature commit at end of §2. Don't fragment.
2. Lint baseline: do not regress beyond Sprint 11's number. tsc zero. `next build --webpack` green.
3. Project root `/Users/lowpass/Documents/lowpass-app`.
4. New dep allowed: `qrcode` (already documented in `CC_SPRINT_12.md` as a Phase 2 exception). No other new deps.
5. Branch: continue on the Sprint 12 branch you were on (`a0558c2` was the last Phase 1 commit). Do NOT branch off main; main is behind.
6. Verify before claiming. Name specific files/lines that changed in the report. Adam will diff before merge.
7. Token discipline: any new visual values must reference `var(--lp-…)` tokens. No hardcoded hex outside `color-mix` / hex+alpha for orange tints.
8. Scope creep escape hatch: if any subtask balloons past ~400 LOC of additions or tempts a refactor into adjacent code, STOP and report rather than ship a megacommit.

---

## §2 — QR generation scope

The goal: every `rental_inventory` row has a printable QR code that encodes its `qr_token`, plus a print-friendly view to send a batch of labels to Adam's Brother PTouch Edge.

Concrete deliverables:

1. **Server-side QR PNG endpoint** — e.g. `GET /api/rental/inventory/[id]/qr.png` (or `.svg` if cleaner). Returns the QR for that item's `qr_token`. RLS check via existing `workspace_id` policy. Cache headers appropriate for an immutable-per-token render.
2. **Logo embedding** — small Lowpass logo (or just initial "L" / brand orange dot) in the center of the QR. Use the `qrcode` library's image-overlay support or composite via a server-side canvas pass. Error correction level: H (so the logo overlay doesn't break decode).
3. **Per-item QR preview** — surfaced inside the existing equipment detail slide-over (or its rental equivalent). Shows the rendered QR plus a "Print" button. Token displayed underneath as plain text for human readability.
4. **Bulk print view** — a route like `/rental/print-labels?ids=…` that renders a grid of QR labels sized for the PTouch Edge tape. Adam will fire it from the equipment grid with a multi-select. CSS `@page` + `print:` Tailwind utilities for the print stylesheet. Default to a label size sensible for 24mm tape (confirm with Adam if you need a final dimension — fall back to 25×25mm per label as a starting guess).
5. **Audit log on print (optional, if cheap)** — when bulk print fires, insert a `manual_correction` `rental_movements` row noting "QR labels reprinted for N items". Skip if it bloats §2 by more than ~20 LOC.

Out of scope for §2 (these are §3+):

- Scan-in / scan-out flow
- Mobile camera capture UI
- Job-level gear views
- Carnet CSV
- Quote PDF

If you find yourself touching code for any of the above to make §2 work, that's a smell. Halt and report.

---

## Halt-and-report criteria

Stop and ping Adam before merging if any of these come up:

- A required dep beyond `qrcode` is needed
- The print stylesheet requires CSS that conflicts with the existing global print rules
- The QR + logo combination won't decode reliably at the small PTouch tape sizes (test by rendering one and decoding with your phone before declaring done)
- An existing prod table needs a new column to support §2 (a migration 096 would be a refactor — flag don't ship)

---

## Reporting expectations

After the §2 commit, post back:

```
Phase 2 done. Commit: <hash>
Files added/changed: [path:line summary for each]
New dep: qrcode@<version>
Verify: tsc zero, lint X/Y (baseline was Z), build green
QR decode test: rendered <route>, scanned with iPhone — token resolved to <id>
Blockers: [empty if clean]
```

Also post §6 + §7 mockups in the same reply (Track A).

If §2 reveals an unexpected gotcha that bumps it past the 400 LOC line in good faith, halt before the bloat — Adam would rather see a smaller §2 land cleanly and pick up the extras in §2.1 than a fat single commit that's hard to review.
