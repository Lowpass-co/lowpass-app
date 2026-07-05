# CC — Labor calls (new object). Closes AdvanceWithMe's only object-level advantage. SINGLE OWNER.

> **RUN ORDER 4 of 6 — see `ROADMAP_2026-07.md`. Requires the design pass's Advance decomposition (order 3) — its section block registers into the decomposed builder, NOT the 6k-line monolith.**

Source: `docs/design/COMPETITIVE_ADVANCEWITHME_2026-07.md` beat-list #2.

## What it is
Per-day crew call schedule: which departments, how many heads, called when, from which local company, under what rules. First-class object because TMs template it, venues/local production confirm it, and it prints on the day sheet — a Schedule text field can't do any of that.

## Data
Migration (next free 2xx, idempotent, down-block, hand-paste): `labor_calls (id, workspace_id, tour_id, routing_id, department text, call_time time, headcount int, company text, contact_name text, contact_phone text, meal_break_notes text, union_notes text, notes text, sort_order int, created/updated)`. RLS via the standard workspace helpers. Departments are free-text with suggested defaults (steel, audio, lights, video, backline, loaders, wardrobe, runner) — no enum; touring reality is messy.
Template layer: `labor_call_templates (artist_id?, tour_id?, name, rows jsonb)` — apply-to-day copies rows (additive, like budget templates). Artist-level template inherits to tours per the existing scope pattern.

## Surfaces
1. **Advance day (primary home):** a "Labor call" section card — table of calls for that day (dept · call · heads · company · contact), add/duplicate rows, apply-template. Registered as a typed block in the decomposed Advance builder (like MealTimes), not generic fields.
2. **Intake:** labor call rows are venue/local-production fillable (they usually know the local crew company) — same additive never-clobber merge; TM reviews via the Review grammar.
3. **Day sheet / export:** renders as its own block; also on `/m/today` (crew care about calls more than anything else on the sheet).
4. Tour-level: Crew section gains a "Labor" sub-tab listing calls across days (read + jump to day). Keep thin — the day is the editing home.

## Gates
Floor green · CRUD + template-apply scripted proof · intake round-trip proof (venue fills a row, TM accepts, row lands) · LAB-01..04 smoke IDs same PR · migration SQL posted for Adam before any code depends on the table.

## Out of scope
Payroll linkage (local crew ≠ tour payroll — do NOT wire into rate_lines) · notifications (separate lane) · visual polish beyond the standard system.
