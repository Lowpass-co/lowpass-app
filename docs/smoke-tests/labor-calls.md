# Labor calls — smoke tests (P6)

Object: per-day crew call schedule. First-class `labor_calls` table (migration
239). NOT payroll (local crew ≠ tour payroll; never touches rate_lines).

| ID | Test | Expected |
|----|------|----------|
| **LAB-01** | On an advance day, add a **Labor call** block to a section (builder field type "Labor call"), then Add call · edit a row · Duplicate · Delete. | The block renders via the **block registry** (`components/advance/blocks/registry.tsx`), NOT a hardcoded label-match. Rows persist to `labor_calls` (routing-scoped); duplicate copies the row; delete removes one row. |
| **LAB-02** | Save the day's calls as a template ("Save as template"), clear the day, then Apply that template. Apply it a **second** time. | Template rows copy onto the day **additively**; a second apply adds **nothing** (never-clobber — same dept+call_time skipped). Artist-scoped templates appear on all the artist's tours. |
| **LAB-03** | Venue fills a labor row via the advance intake form; the TM accepts it. Re-submit the same row. | Accepted row **lands additively**; an existing TM row with the same dept+call_time is **never overwritten** or double-created (the shared `additiveLaborRows` rule — proven by `merge.harness.ts`, 7/7). |
| **LAB-04** | Open the day sheet / `/m/today`; open Operations › Labor for the tour. | The labor calls render as their **own block** on `/m/today` (registry ReadView); the tour Labor surface lists calls grouped by day with an **Open day →** jump to the advance day (read-only; the day is the editing home). |

## Notes
- Migration 239 (`labor_calls` + `labor_call_templates`) applied by hand (Adam) —
  workspace-scoped RLS via `get_my_workspace_id()`.
- Merge rule (`src/lib/labor-calls/merge.ts`) is the ONE additive/never-clobber
  path shared by template-apply and intake-accept; harness:
  `node --experimental-strip-types src/lib/labor-calls/merge.harness.ts`.
