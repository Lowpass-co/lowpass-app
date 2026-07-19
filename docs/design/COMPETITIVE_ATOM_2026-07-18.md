# Competitive audit — ATOM Interstate vs Lowpass (2026-07-18)

Source: `atominterstate.app/atom-flow.html` (interactive module map, studied live) + an evidence-based read of the Lowpass codebase (every claim below carries file:line evidence from the audit subagent; nothing credited on keyword match alone). Adam's framing: **Lowpass's focus is budget, advance, personnel. Day-sheet matters less. Social/community is explicitly rejected.**

## 1. What ATOM is

A single "nerve system" map of ~20 modules on five colour-coded rails: **Money** (financial truth) · **Production** (show truth) · **Tour Book** (one day-view surface) · **Community** (per-person, cross-tour) · **Driver** (bus + truck), plus cross-cutting modes. Modules: Atom Money, Master Budget, Settlement, Pay Ledger + Per Diems, Air Calculator, Atom Production, Stage Plot Builder, Advance + Venue Portal, Atom Market, Tour Book · Day View, Hotels + Bus-Friendly Picker, Guest List, Travel · Flights + Ground, Atom Driver, Atom Parking, Asset Manager, Contacts · Rolodex (40+ fields/person), Atom Community, Atomspace (shareable profile), Atom Docs (every input becomes a PDF), International Mode (auto-engages on border crossing).

**Their thesis:** everything is one connected graph — "deal memo to crew pay, receipt to budget line, flight number to live gate tracking." Their scenario demos are literally the seams: *A show end to end · A crew member, hire to paid · Day of show, load-in to soundcheck · A receipt's life · A flight goes live · Settlement night.*

## 2. Visual language worth stealing (Adam: "it's good! I love it!")

- **Dark canvas + restrained neon accents per rail** — colour carries meaning (money/production/community), never decoration. This is our hue-budget doctrine executed with more confidence.
- **Condensed uppercase display type** for module names against small mono micro-labels — near-identical to our Barlow Condensed + JetBrains Mono pairing. Validates the type system we already chose.
- **Cards as nodes with a coloured top-rule + tiny status dots** — a legible "chip" language at small size.
- **Motion as explanation**: animated particles travel the wires to show data moving. Their scenario player walks a flow step-by-step.
- **The map itself as a product artifact** — a shareable, explorable diagram of how the system is wired.

**Adopt:** the rail-colour discipline, the node-card treatment, the scenario-walk idea as onboarding. **Reject:** particle animation as chrome inside the working app (it belongs on a marketing canvas, not a grid you use daily).

## 3. Capability audit — where Lowpass actually stands

Legend: ✅ exists · ◐ partial · ✗ absent. All evidence verified in-repo.

### Core focus areas (budget · advance · personnel)
| Capability | Lowpass | Evidence / gap |
|---|---|---|
| Budget + actuals, versioning, FX | ✅ strong | version RPCs, per-row locked FX, provenance |
| Settlement math (day-of vs reconciled, cascade to income) | ✅ | `api/budget/settlement/route.ts:1-370` |
| **Walkout** | ✗ | concept absent entirely |
| **Withholding / itemized tax deductions** | ✗ | only a single generic `deductions` number |
| **Settlement PDF** | ◐ | deductions appear inside the budget PDF; no standalone settlement doc |
| Payroll rate types + fee math + statements | ✅ strong | `lib/payroll/fees.ts`, `payroll-pdf.ts`, 64-check harness |
| **Wage projection vs actual variance** | ✗ | statements compute totals; no plan-vs-actual delta |
| Per diems | ◐ | folded into rate-type buckets; **no dedicated per-diem report, no cash-out/signature tracking** |
| Advance builder (Build/Advance/Share, 12 field types, templates) | ✅ strong | decomposed surfaces |
| **Venue intake portal w/ pending-review queue** | ✅ **best-in-class** | `advance-intake/[token]` + `intake_pending_answers`; **no signup required — ATOM's portal and AdvanceWithMe both make venues create accounts** |
| Contacts / rolodex | ◐ | `contacts` = **8 fields** vs ATOM's **40+**; `persons` adds 13 (passport/DOB/dietary) |
| Cross-tour person reuse | ◐ | canonical within a workspace, but **no tour-history list on the person record** |
| Rooming | ✅ strong | matrix, cards, hotel sheet, PDF |

### AI — the big one (Adam: "doesn't exist yet but is a huge featureset")
| | Lowpass | Reality |
|---|---|---|
| Venue tech-pack → intake answers | ✅ **wired end-to-end** | `public/advance-intake/[token]/tech-pack/route.ts:1-177` — upload → Claude extract → sanitize → `intake_pending_answers` → TM review. Never auto-writes. |
| Deal memo → advance fields | ◐ | `api/advance/extract-deal-memo/route.ts` extracts guarantee/guest list/transport/venue and returns JSON for review; write is client-side after approval |
| Receipt OCR → budget line | ◐ **the gap Adam named** | `api/budget/receipts/ocr/route.ts:131-213` runs Claude vision and stores `raw_ocr_json` — but **never proposes a budget line**. Extraction lands in a JSON column and stops. |
| Generic document parsing | ◐ | PDF/image extraction duplicated per use-case; no shared endpoint |

**Verdict:** the AI *plumbing* is better than Adam thinks (two live Claude pipelines, metered, with a review-queue pattern already proven). What's missing is the **last mile on receipts** — OCR result → proposed budget line → accept/reject → written. That's a small build on top of infrastructure that already exists, not a new capability.

### Where ATOM is genuinely ahead
| ATOM module | Lowpass | Note |
|---|---|---|
| **Day Sheet (Tour Book · Day View)** — schedule+contacts+venue+travel+rooming on one surface, as PDF | ◐/✗ | our day page is a P&L+advance panel, **not** an aggregated day rollup; **no day-sheet PDF at all** |
| **Guest list** — structured, per-show | ✗ | we have a free-text field inside deal-memo extraction. Nothing structured. |
| **Travel — flights with live status** | ◐ | flights CRUD exists; **no flight-number lookup or live tracking** |
| **Hotels — bus-friendly picker, loyalty numbers** | ✗ | manual entry + booking-status labels only |
| **Asset Manager — containers/cases** | ◐ | `gear` + `tour_gear` exist; **no container/case grouping** |
| **International Mode** — per-day country/zone/voltage, border awareness | ◐ | multi-currency ✅; country only implicit via venue; **voltage/border ✗** |
| **Atom Driver / Parking** — HOS, driver views, lot logistics | ✗ | zero implementation |
| **Tour resume PDF** (per-person history) | ✗ | doesn't exist |
| **Atom Docs** — "every input becomes a PDF" | ◐ | we have 8 PDF types (budget, payroll, rooming, routing, channel list, stage plot, rider, advance packet) — **missing: day sheet, settlement, per-diem, tour resume** |
| Community / Atomspace (social) | ✗ | **REJECTED by Adam — do not build** |

## 4. Recommended additions, ranked by (value to our focus) ÷ (build cost)

**P1 — do these next**
1. **Receipt → budget line, last mile.** OCR already runs and stores JSON. Add: propose a line item (vendor, amount, currency, date, suggested section) → the existing accept/reject Review grammar → write on accept. Reuses the intake-review component. *Highest value-per-hour in the entire backlog.*
2. **Settlement PDF + itemized deductions.** Settlement math exists; give it a real document and replace the single `deductions` number with itemized lines (withholding, tax, venue costs). Settlement night is a money moment that currently produces no artifact.
3. **Day sheet as a real object + PDF.** The one ATOM/Daysheets surface worth matching: aggregate schedule + day-of contacts + venue + travel + rooming + labor calls for one day; export as the shared-shell PDF; feed `/m/today`. We have every input already — this is assembly, not new data.
4. **Per-diem report + cash-out tracking.** Dedicated report, per-person totals, signature/cash-out state. Small, and it's a weekly TM chore.

**P2 — strong differentiators**
5. **Contacts depth**: expand toward ATOM's 40-field rolodex (day-of roles, alt numbers, radio channel, dietary, emergency contact) + **tour-history list on the person record** (cross-tour reuse already exists in the data — just unsurfaced).
6. **Wage projection vs actual variance** — plan-vs-actual delta in payroll, mirroring budget's estimate-vs-actual. Natural extension of the fee engine.
7. **Structured guest list** — per-show named guests, allocation, cutoff, comps; feeds day sheet + advance.
8. **Flight status lookup** — flight number → schedule/gate/status. Cheap via a flight API; high perceived magic.

**P3 — later or never**
9. International: per-day country/zone/voltage chips (cheap, nice for EU tours). Border awareness (moderate).
10. Asset containers/cases grouping.
11. Driver/HOS/parking — **skip**: outside our focus, deep domain, ATOM's differentiator not ours.
12. Community/Atomspace — **never** (Adam's explicit call).

## 5. Positioning conclusion

ATOM is broader; we are **deeper where money lives**. Our defensible edges: money correctness proven by a 64-check reconcile harness with per-row FX locking and provenance (nobody else demonstrates this), **no-signup venue intake** (both competitors force venue accounts), rate-type-driven payroll with day-type overrides, and the artist→tour→show inheritance chain. The gaps that actually cost us in a demo are the four P1s — and three of the four are assembly of data we already hold. Fix those and the only remaining honest gap versus ATOM is breadth we deliberately chose not to chase.
