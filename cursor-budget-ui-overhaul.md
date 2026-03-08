# Cursor Prompt: Budget UI Visual Overhaul

## Context

The budget page (`src/app/(app)/budget/page.tsx`) has 11 tab components in `src/components/budget/`. The current UI is functional but visually poor — dense tables, hard to read, hard to edit, no visual hierarchy. The owner wants it to feel like a **modern web app version of a well-designed spreadsheet** — specifically inspired by Google Sheets budget templates with clear section headers, colour-coded categories, inline-editable cells, and strong visual hierarchy.

**Stack**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4 (using `@theme inline` design tokens in `globals.css`), Supabase. The app uses dynamic imports for budget tabs already — each tab is its own `'use client'` component.

**Design tokens already defined in `globals.css`**: `lp-orange` (#FF4500), `lp-bg`, `lp-surface`, `lp-border`, `lp-text`, `lp-text-secondary`, `lp-text-tertiary`, `lp-success` (#10B981), `lp-warning` (#F59E0B), `lp-error` (#EF4444), plus day-type colours (`lp-day-show`, `lp-day-off`, etc.). Dark mode is supported via `.dark` class on `<html>`.

## Design Direction

**Primary inspiration**: The attached spreadsheet screenshots — but translated into a modern SaaS app, not a literal spreadsheet clone. Think: Notion-like inline editing, Linear-like clean density, Stripe Dashboard-like data presentation.

**Key principles**:
1. **Spreadsheet-like data density** — data should be visible and scannable, not hidden behind modals or accordions
2. **Inline editing by default** — cells should be editable on click (not via a separate edit mode with pencil icons). Click a number → it becomes an input. Blur or Enter → it saves. No edit/save/cancel button dance.
3. **Strong visual hierarchy** — section headers with background colour bands, subtotal rows visually distinct, grand totals prominent
4. **Colour coding** — use the existing design tokens. Proposed = default text colour. Actual = `lp-orange`. Variance: green (under budget), amber (0-5% over), red (>5% over). Category headers get subtle coloured left borders or background tints.
5. **Currency formatting** — all money values right-aligned, tabular-nums, formatted with locale (en-GB), 2 decimal places, currency symbol prefix from budget settings

## Specific Component Changes

### ALL tab components (global patterns)

**Replace the edit-mode pattern everywhere.** Currently every tab has: `editingId` state, `editRow` state, pencil icon to enter edit mode, Save/Cancel buttons. This is clunky.

**New pattern — inline editable cells:**
```
// Create a reusable InlineEdit component at src/components/budget/InlineEdit.tsx
// Props: value, onSave, type ('text' | 'number' | 'currency' | 'select'), options (for select), placeholder
// Behaviour:
// - Displays value as plain text by default
// - On click: transforms into an input/select
// - On blur or Enter: calls onSave(newValue), reverts to display mode
// - On Escape: reverts without saving
// - For 'currency' type: displays formatted number, edits as raw number
// - Subtle hover effect to indicate editability (light background change)
```

Also create `InlineCurrencyCell` specifically for money values — right-aligned, tabular-nums, formats on display, raw number on edit.

**Remove all "Add [thing]" buttons that open inline form rows.** Instead, have an "Add row" button at the bottom of each table that appends a new row with empty/default values already saved to the DB, then auto-focuses the first editable cell in that new row.

**Delete**: Keep the existing delete approach (trash icon → confirmation modal) but make the trash icon only visible on row hover.

### SummaryTab.tsx

This is **read-only** (no editing needed). Redesign to match the spreadsheet's summary layout:

- **Top banner**: Full-width card with artist name, tour name, tour dates, currency, show/off/total day counts. Dark background (`lp-bg-tertiary` in dark mode or subtle gradient) with white/light text.
- **Two-column layout below the banner**:
  - **Left column (60%)**: Expenses breakdown table — category rows grouped under section headers (Direct Expenses, Overheads), with Planned/Actual/Diff columns. Section headers get a subtle coloured background band. Subtotal rows are bold with a top border. Grand total row has a stronger border and larger text.
  - **Right column (40%)**: Income breakdown + Management & Fees (accountancy, insurance, contingency, commissions) + a mini P&L box showing the bottom line (Planned profit, Actual profit, Variance) with large, colour-coded numbers.
- **Visual P&L indicator**: At the very top of the right column, a large card showing: "Planned Profit: £X,XXX" and "Actual Profit: £X,XXX" with a percentage variance badge. Green background tint if profitable, red if loss.
- Use horizontal bar charts or simple progress bars to visually compare planned vs actual for major categories (just CSS, no chart library needed).

### IncomeTab.tsx

- Table with one row per show/routing date
- Columns: Date | City/Venue | Day Type | Pre-Tax Guarantee | Withholding % | Post-Tax Guarantee | Merch | VIP | **Row Total**
- Actual columns appear to the right: Actual Guarantee | Actual Overage | Actual Merch | Actual VIP | **Actual Total**
- Day type should show a small coloured dot/badge using the `lp-day-*` colours
- All number cells are inline-editable
- Footer row: **TOTALS** row pinned to bottom with sums
- Separate row or section below for "Proposed Gross Income" and "Actual Gross Income" as prominent summary values

### SalariesTab.tsx

- Show personnel in a card-per-person layout OR a table, whichever is cleaner
- Each person row: Name | Role | Rate Type (badge) | Show Rate | Off Rate | Rehearsal Rate | Advance Fee | Per Diem | **Calculated Salary** | **Calculated Per Diem Total**
- Rate type shown as a pill/badge: "Split Rate" or "Day Rate"
- The calculated columns should be visually distinct (slightly greyed background, italic or different weight) to indicate they're computed, not editable
- Advance fee auto-suggest: show a small "(suggested: £X)" hint below the advance fee input based on the §4 formula
- Summary cards below the table: Total Salaries (Proposed), Total Per Diem (Proposed), with Crew/Band subtotals if role grouping exists

### PayrollTab.tsx

- Person selector at the top (dropdown or horizontal tabs showing crew member names)
- Weekly payroll grid: rows = weeks (Mon–Sun), columns = Mon | Tue | Wed | Thu | Fri | Sat | Sun | Week Fee | Per Diem | Total
- Each day cell shows the day_status as a coloured badge/dot (show=green, off=grey, travel=blue, rehearsal=purple, etc.)
- Week fee and per diem are computed and shown in the read-only styled columns
- Footer: Tour totals for this person
- "Generate Payroll" button that auto-generates entries from routing data

### HotelsTab.tsx

- Hotel bookings as expandable cards/rows
- Each hotel: Name | City | Check-in | Check-out | Nights | Rate/Night | **Total Cost** | Confirmation #
- Expand to show room assignments underneath (nested sub-table): Person | Room Type | Rate Override | Nights
- Inline-editable for all fields
- Summary footer: Total Hotel Cost (Proposed) vs (Actual)

### FlightsTab.tsx

- Clean table sorted by departure date
- Group visually by person (alternating subtle background or separator rows)
- Columns: Person | Role | Route (Origin → Dest as styled arrow) | Date & Time | Airline/Flight # | Leg | Proposed | Actual | Variance | Confirmation
- Inline-editable
- Footer: Total Flights cost

### TransportationTab.tsx & ProductionTab.tsx

These are identical in structure (category-grouped line items). Redesign both the same way:

- Category headers as section dividers (full-width row with category name, coloured left border matching a category colour, and category subtotal on the right)
- Line items under each category: Description | Qty | Proposed | Actual | Notes
- All inline-editable
- Drag to reorder (or keep the up/down arrows but make them more subtle — only visible on hover)
- Category subtotals and grand total at the bottom

### CommissionsTab.tsx

- Table: Label | Percentage (editable, displayed as "10.0%") | Basis (dropdown: Gross/Net/etc.) | Calculated Proposed | Calculated Actual | Notes
- Calculated columns greyed/computed style
- Live preview: as you edit percentage or basis, the calculated amounts update immediately
- Total row at bottom

### ReceiptsTab.tsx

- Table with: Receipt # | Date | Vendor | Description | Category | Amount (Tour Currency) | Amount (Home Currency) | In Budget (toggle) | Linked Line Item
- "In Budget" as a styled toggle switch, not a checkbox
- File upload area for each receipt (existing functionality, just better styled)
- Filter/search bar at the top to filter by category or vendor

### SettlementTab.tsx

- One card per show date
- Each card: Date | City/Venue | Guarantee | Overage | Merch | Deductions | **Net** | Status
- Net is calculated and colour-coded (positive = green, negative = red)
- Inline-editable for guarantee, overage, merch, deductions
- "Sync to Income" button per row (existing functionality)
- Summary at bottom: Total Net, Total Guarantee, etc.

## Implementation Notes

1. **Create shared components first**: `InlineEdit.tsx`, `InlineCurrencyCell.tsx`, `BudgetTable.tsx` (a styled table wrapper with consistent header/footer/section patterns), `SectionHeader.tsx`
2. **Preserve all existing API calls and data flow** — this is a UI-only change. Do not modify any API routes or data fetching logic.
3. **Preserve all existing math** — do not change any calculations. The math has been verified against the spec.
4. **Test with dark mode** — all changes must work in both light and dark themes using the existing `lp-*` design tokens.
5. **Use Tailwind only** — no additional CSS files or styled-components.
6. **Keep `'use client'` on all tab components** — they need client-side state for inline editing.
7. **Mobile**: Budget page is primarily desktop. Don't break mobile but don't optimise for it either — horizontal scroll on tables is fine.
8. **The `Number() || 0` pattern is correct and intentional** — do not change it back to `?? 0`.
