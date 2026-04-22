# Cursor Prompt — PR A0.6: Consolidate `dayTypeLabel` helpers

Paste this whole file into Cursor. Execute in order. Do not skip steps. Do not add scope beyond what is listed. If a step is ambiguous, stop and ask rather than guessing.

---

## Step 0 — VERIFY this PR hasn't already been done

Before making any changes, run these checks and paste the output back:

```bash
# (a) Check whether the canonical shared module already exists
ls -la src/lib/dayType.ts 2>/dev/null || echo "MISSING: src/lib/dayType.ts"

# (b) Count how many places still declare a local `function dayTypeLabel`
git grep -n "^function dayTypeLabel\|^  function dayTypeLabel" src/

# (c) Who currently imports from @/lib/dayType
git grep -n "from '@/lib/dayType'" src/
```

**Decision tree:**

- If (a) returns a real file path AND (b) shows **zero** remaining local `function dayTypeLabel` declarations AND (c) shows imports from `@/lib/dayType` — the PR is already done. Report that and stop. Do nothing else.
- If (a) says MISSING AND (b) shows at least one (ideally three) local declarations — proceed from Step 1.
- Any other mixed state — stop and ask which files are in a partial state before editing anything.

---

## Design references (standing — applies to all Lowpass PRs)

Lowpass borrows from three products:

1. **Daysheets (daysheets.com)** — visual + interaction vocabulary. Dark mode as hero state (#0f172a). "All / Me" universal personal filter. Party chips as primary schedule filter. Dense grids for tabular data. Day Types render with coloured accents. Mobile reaches full parity.
2. **Xero** — budget UX: inline-editable row lists with running totals, category grouping; budget/forecast grid with rows × columns editable cells. Inline save on blur/Enter, no modals.
3. **Notion** — context menus: right-click anywhere on a row + visible `⋯` kebab on row hover. Keyboard-accessible.

Not directly relevant to this refactor, but kept here as a standing block for consistency across all future prompts.

---

## Context

Three files currently define their own local `dayTypeLabel` (and a sibling colour/class helper) with subtly different behaviour:

### (1) `src/components/layout/TourRoutingList.tsx` (A0.5 — most thorough, CANONICAL)
```ts
function dayTypeSegments(dayType: string): string[] { ... }
function dayTypeAccent(dayType: string): string {
  // hex colors keyed by priority-scanned segments
  // show=#FF4500, festival=#9B59B6, travel=#3498DB, rehearsal=#F59E0B, off=#64748B, default=var(--lp-sidebar-text-muted)
}
function dayTypeLabel(dayType: string): string {
  // priority order: ['show','festival','travel','rehearsal','press','off']
  // returns 'Show Day' | 'Festival' | 'Travel Day' | 'Rehearsal' | 'Press Day' | 'Off Day' | capitalised-fallback
}
function formatDateHeading(dateStr: string): string { ... }  // "TUESDAY, MAY 19"
function formatDateCollapsed(dateStr: string): string { ... } // "19\nMAY"
```

### (2) `src/components/advance/AdvanceShowReadView.tsx:113`
```ts
function dayTypeLabel(t: string) {
  const map: Record<string, string> = {
    show: 'Show Day', festival: 'Festival', off: 'Day Off',         // note: 'Day Off' not 'Off Day'
    travel: 'Travel Day', rehearsal: 'Rehearsal', press: 'Press Day',
  };
  return map[t] ?? t;
}
function dayTypeClass(t: string) {  // returns Tailwind classes for a badge
  if (t === 'show' || t === 'festival') return 'bg-lp-orange/15 text-lp-orange';
  if (t === 'off') return 'bg-lp-surface text-lp-text-tertiary';
  return 'bg-blue-500/15 text-blue-400';
}
```

### (3) `src/components/budget/DayViewTab.tsx:56`
```ts
function dayTypeLabel(dayTypeRaw: string): string {
  const t = (dayTypeRaw ?? '').split(',')[0]?.trim() || 'off';
  return t.toUpperCase();                                           // returns "SHOW" | "TRAVEL" | "OFF"
}
function dayDotClass(dayTypeRaw: string): string {
  // bg-emerald-500 for show/festival (inconsistent with AdvanceShowReadView's orange!)
  // bg-blue-500 for travel, bg-lp-text-tertiary default
}
```

**Why this matters:**

- **Label drift**: "Off Day" (TourRoutingList) vs "Day Off" (AdvanceShowReadView) vs "OFF" (DayViewTab).
- **Colour drift**: show=#FF4500 orange (TourRoutingList, AdvanceShowReadView) vs show=emerald-500 (DayViewTab). Two of three agree on orange; DayViewTab is the outlier.
- Adding a new day type requires touching three files; easy to forget one.

This PR consolidates **only the label + accent helpers** (the overlapping logic). The badge-class and dot-class helpers stay per-file because they're styling concerns specific to each component's design. A follow-up design pass will align the colours properly.

---

## Goal

1. Create `src/lib/dayType.ts` exporting `dayTypeSegments`, `dayTypeLabel`, `dayTypeAccent`, `formatDateHeading`. Content byte-identical to TourRoutingList's current versions.
2. Migrate all three consumers to import from `@/lib/dayType`. Delete the local helpers in each.
3. In `DayViewTab.tsx` only: the existing render site uses Tailwind `uppercase` on the span, so switching to the title-case canonical label is a no-op visually. Verify the render still looks identical in the browser.
4. Leave `dayTypeClass` (AdvanceShowReadView) and `dayDotClass` (DayViewTab) alone. Colour alignment is out of scope here.

No schema changes, no route changes, no new dependencies.

---

## Files to create / modify

### 1. `src/lib/dayType.ts` (NEW)

```ts
/**
 * Canonical day-type helpers for Lowpass routing rows.
 *
 * `day_type` is a free-form comma-separated string on the `routing` table
 * (e.g. "show", "show, press", "travel", "festival", "off"). These helpers
 * parse it, pick the most significant segment by priority, and return a
 * human label or the Lowpass accent colour.
 *
 * Styling helpers that return Tailwind classes live next to the component
 * that renders them (e.g. `dayTypeClass` in AdvanceShowReadView,
 * `dayDotClass` in DayViewTab). Those are per-component design decisions
 * and intentionally stay local.
 */

export function dayTypeSegments(dayType: string): string[] {
  return (dayType ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function dayTypeAccent(dayType: string): string {
  const segs = dayTypeSegments(dayType);
  if (segs.some((s) => s === 'show')) return '#FF4500';       // Lowpass brand orange
  if (segs.some((s) => s === 'festival')) return '#9B59B6';   // purple
  if (segs.some((s) => s === 'travel')) return '#3498DB';     // blue
  if (segs.some((s) => s === 'rehearsal')) return '#F59E0B';  // amber
  if (segs.some((s) => s === 'off')) return '#64748B';        // slate-500
  return 'var(--lp-sidebar-text-muted)';                      // unknown → muted
}

export function dayTypeLabel(dayType: string): string {
  const segs = dayTypeSegments(dayType);
  const priority = ['show', 'festival', 'travel', 'rehearsal', 'press', 'off'];
  const primary = priority.find((p) => segs.includes(p)) ?? segs[0];

  switch (primary) {
    case 'show': return 'Show Day';
    case 'festival': return 'Festival';
    case 'travel': return 'Travel Day';
    case 'rehearsal': return 'Rehearsal';
    case 'press': return 'Press Day';
    case 'off': return 'Off Day';
    default: return primary ? primary.charAt(0).toUpperCase() + primary.slice(1) : '';
  }
}

export function formatDateHeading(dateStr: string): string {
  // "TUESDAY, MAY 19"
  return new Date(`${dateStr}T12:00:00`)
    .toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric' })
    .toUpperCase();
}
```

### 2. `src/components/layout/TourRoutingList.tsx`

Remove the four local helpers (`dayTypeSegments`, `dayTypeAccent`, `dayTypeLabel`, `formatDateHeading`) from lines ~16–59. Keep `formatDateCollapsed` — it's specific to the 72px sidebar and not worth exporting.

Add at top:

```ts
import { dayTypeAccent, dayTypeLabel, formatDateHeading } from '@/lib/dayType';
```

Leave all call sites unchanged — they reference the same function names.

### 3. `src/components/advance/AdvanceShowReadView.tsx`

Remove the local `dayTypeLabel` function (lines ~113–119). Keep `dayTypeClass` — still used by this component.

Add at top (near other `@/lib` imports):

```ts
import { dayTypeLabel } from '@/lib/dayType';
```

The existing call at line ~655 (`dayTypeLabel(routing.day_type)`) works unchanged. **Note**: canonical returns "Off Day" not "Day Off" — if there's a visible regression on the advance read-view where an off-day now says "Off Day" instead, flag it. Don't revert — that's the intended alignment. Paste the before/after comparison for Adam to sanity-check.

### 4. `src/components/budget/DayViewTab.tsx`

Remove the local `dayTypeLabel` function (lines ~56–59). Keep `dayDotClass` — still used.

Add at top (near other `@/lib` imports):

```ts
import { dayTypeLabel } from '@/lib/dayType';
```

The existing call site at line ~248 uses `uppercase tracking-widest` CSS classes, so switching from the old function's `.toUpperCase()` to the canonical title-case label renders identically in the browser (CSS uppercases it). Confirm visually in dev.

---

## Hard rules — do not break

1. Do **not** touch `dayTypeClass` in `AdvanceShowReadView.tsx` or `dayDotClass` in `DayViewTab.tsx`. These stay local.
2. Do **not** touch `formatDateCollapsed` in `TourRoutingList.tsx`. It's sidebar-specific.
3. Do **not** change the priority order in `dayTypeLabel`. The "show, press" → "Show Day" behaviour is intentional.
4. Do **not** change `day_type` in the DB or the API. This is a pure frontend refactor.
5. Do **not** add new exports to `@/lib/dayType` beyond the four listed.
6. Do **not** touch any other files that happen to reference `day_type` (e.g. `calendar/feed.ics/route.ts`). Scope is limited to the three consumers above.

---

## Acceptance criteria (run through each before finishing)

- [ ] `src/lib/dayType.ts` exists and exports `dayTypeSegments`, `dayTypeLabel`, `dayTypeAccent`, `formatDateHeading` — and nothing else.
- [ ] `npx tsc --noEmit --skipLibCheck` is clean.
- [ ] `npm run lint` adds no new errors.
- [ ] `git grep -n "^function dayTypeLabel" src/` returns **zero** matches (all local copies removed).
- [ ] `git grep -n "^function dayTypeAccent" src/` returns **zero** matches.
- [ ] `git grep -n "from '@/lib/dayType'" src/` returns **exactly three** files: TourRoutingList.tsx, AdvanceShowReadView.tsx, DayViewTab.tsx.
- [ ] `git grep -n "function formatDateHeading" src/` returns **zero** matches (moved to `@/lib/dayType`).
- [ ] `git grep -n "function formatDateCollapsed" src/components/layout/TourRoutingList.tsx` returns **one** match (still local — intentional).
- [ ] Dev-server smoke: load the sidebar date list with a tour containing at least one show, one travel, and one off day. Accent bars + labels render correctly (Show Day orange, Travel Day blue, Off Day slate).
- [ ] Dev-server smoke: load the advance read view for a show day — the badge still renders "Show Day" in orange.
- [ ] Dev-server smoke: load the budget DayViewTab — the day-type pill still renders uppercase (e.g. "SHOW DAY" via CSS) and the dot colour is unchanged (still emerald for show, still blue for travel — the dot inconsistency is a separate future PR).
- [ ] No off-day label regressions: if `AdvanceShowReadView` previously read "Day Off", it now reads "Off Day". Note as expected behaviour.

---

## Verification commands

```bash
npx tsc --noEmit --skipLibCheck
npm run lint

git grep -n "^function dayTypeLabel\|^  function dayTypeLabel" src/
git grep -n "from '@/lib/dayType'" src/
git grep -n "function formatDateHeading" src/
```

Expected output summary:
- First grep (local `dayTypeLabel` declarations): **empty**.
- Second grep (imports): three files — TourRoutingList.tsx, AdvanceShowReadView.tsx, DayViewTab.tsx.
- Third grep (stray `formatDateHeading` declarations outside `@/lib`): **empty** (the only definition should now live in `src/lib/dayType.ts`).

---

## Out of scope for this PR (explicitly defer)

- Aligning `dayDotClass` colour for show days (emerald vs orange) — **separate PR**, call it A0.7 or fold into Phase A1 budget rework.
- Moving `dayTypeClass` and `dayDotClass` into the shared module — deferred until colour alignment is decided.
- Aligning `lp-sidebar-mode` localStorage key name → A0.4.
- Deleting orphaned `Header.tsx` / `HeaderArtistTourPicker.tsx` → A0.4.
- Any visual redesign of day-type badges — later Phase.

---

## Output format expected from Cursor

1. The Step 0 verification output (paste verbatim).
2. If skipped because already done — just report that and stop.
3. Otherwise: file tree diff listing `src/lib/dayType.ts` (new) + three `.tsx` files modified.
4. Output of `npx tsc --noEmit --skipLibCheck` (expect empty).
5. Output of the three `git grep` verification commands.
6. A short note on any deviations.

Then stop. Do not auto-continue into A0.4 or any other PR.
