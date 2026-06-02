# Lowpass — UX / Design-System Audit 2026

> Run through the **UI/UX Pro Max** skill (NextLevelBuilder, v2.5.0) + a 25-year-UI-lead
> review of the actual codebase. The skill confirmed Lowpass's product archetype and
> surfaced the systemic interaction-consistency gaps; this doc turns that into an
> actionable, repeatable template set that carries across the app.
>
> Branch: `design/ux-audit-2026`. This is a **design strategy + reference primitives**
> deliverable — not a mass refactor. Each fix is scoped so it can ship as its own
> small sprint without destabilising the app.

---

## 0. TL;DR — the one finding that matters

**There is no canonical `<Button>`.** The codebase has **780 raw `<button>` tags across
198 files**, **176 files hardcode brand orange inline**, and **only 41 files have any
focus state at all**. That means ~80% of interactive controls fail the skill's #1
CRITICAL accessibility rule (visible focus rings) and every button's padding / hover /
disabled / loading behaviour is re-decided per file. This is the root cause of "buttons
feel unpredictable across the app."

The fix is a single primitive (`src/components/ui/Button.tsx`, shipped on this branch)
+ a migration plan. Everything else in this audit is secondary.

---

## 1. Product archetype (skill output)

The skill classified Lowpass from the query
`"tour management SaaS dashboard data-dense professional web app"`:

| Dimension | Skill recommendation | Lowpass today | Verdict |
|---|---|---|---|
| **Style** | Data-Dense Dashboard (KPI cards, data tables, grid layout, minimal padding, max data visibility) | Matches — Budget/Payroll/Channel-list grids, density modes | ✅ on-archetype |
| **Effects** | Hover tooltips, row highlight on hover, smooth filter animations, loading spinners | Partially present (DataTable, BrandedSelect); inconsistent | ⚠️ inconsistent |
| **Anti-patterns to avoid** | "Ornate design", "No filtering" | Lowpass is appropriately restrained + has filtering | ✅ clear |
| **Palette** | Generic professional blue `#2563EB` + deal-green `#059669` | Brand orange `#FF4500` | ⏭️ **keep Lowpass brand** — the skill's palette is a default for unknown brands; Lowpass has equity in orange. Apply the skill's *structural* guidance, not its colours. |
| **Type** | Fira Code / Fira Sans (dashboard/data mood) | Geist + JetBrains Mono for numerics | ✅ Lowpass's mono-for-numerics is already best-practice (`number-tabular`) |

**Conclusion:** Lowpass is correctly built as a data-dense dashboard. The gap is not
strategy — it's **interaction consistency at the primitive level.**

---

## 2. Quantified consistency audit (codebase scan)

| Signal | Count | Skill rule | Risk |
|---|---|---|---|
| Canonical `<Button>` primitive | **0** (none existed) | `style-consistency` | Every button re-decided per file |
| Raw `<button>` tags | **780** across 198 files | — | 198 places to change a button behaviour |
| Files hardcoding brand orange | **176** | `color-semantic` (no raw values in components) | Re-theming = 176-file sweep |
| Files with any focus state | **41 / 198** (~21%) | `focus-states` (CRITICAL #1) | ~157 files fail keyboard a11y |
| Files with explicit pointer cursor | **81 / 198** | `cursor-pointer` | Clickable elements that don't look clickable |
| Existing `ui/` primitives | 11 (Badge, BrandedSelect, Card, ContextMenu, DeleteConfirmationModal, FilterChips, Skeleton, SlidingToggle, StyledSelect, Toast, Tooltip) | — | Good foundation — Button + Input + Modal are the gaps |

De-facto button variants found in the wild (the ones the canonical primitive codifies):

```
PRIMARY    bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50   (×10 verbatim, many near-variants)
SECONDARY  border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text hover:bg-lp-surface-hover       (×13+)
GHOST      bg-transparent ... hover:bg-lp-surface-hover                                                          (toolbar/inline, many)
```

The variance is in the *near-misses*: `px-4 py-2` vs `px-3 py-1.5` vs `px-2 py-1`,
`hover:bg-lp-orange-hover` vs `hover:bg-lp-orange/90` vs `hover:opacity-90`,
`disabled:opacity-50` present or absent. Each is individually trivial; collectively
they're why the app "feels" inconsistent.

---

## 3. Canonical interaction templates (the actionable part)

### 3.1 `<Button>` — shipped on this branch (`src/components/ui/Button.tsx`)

The reference primitive. Five variants × three sizes, with focus-visible ring,
disabled, and loading states built in. Visual parity with the existing inline styles
so migration is a like-for-like swap, not a redesign.

```tsx
import { Button } from '@/components/ui/Button';

// Primary CTA — one per view (skill: primary-action)
<Button variant="primary" size="lg" onClick={save}>Save changes</Button>

// Default action
<Button onClick={open}>Manage</Button>            // variant="secondary" size="md"

// Toolbar / inline
<Button variant="ghost" size="sm" leadingIcon={<Plus />}>Add channel</Button>

// Destructive — visually separated from primary (skill: destructive-emphasis)
<Button variant="danger" onClick={remove}>Remove from tour</Button>

// Async — spinner + auto-disable + no layout shift (skill: loading-buttons)
<Button variant="primary" loading={saving}>Generate PDF</Button>
```

**Rules this enforces that the codebase currently doesn't:**

1. `type="button"` by default — kills accidental form submits (the #1 footgun in the 780 raw buttons).
2. `focus-visible:ring-2` on every button — closes the 157-file keyboard-a11y gap.
3. `loading` disables + spins + holds width — no double-submit, no layout shift (skill `loading-buttons` + `content-jumping`).
4. `disabled:opacity-50 disabled:cursor-not-allowed` always paired (skill `disabled-states`).
5. Size → height maps to touch-target rhythm; `lg` = 44px (skill `touch-target-size`).

### 3.2 The interaction contract (applies to every control, not just Button)

A repeatable spec so any new control "feels Lowpass" without re-litigating:

| State | Token / rule | Timing |
|---|---|---|
| Default | semantic token bg/border/text, never raw hex | — |
| Hover (web) | `hover:bg-lp-surface-hover` (neutral) or `-hover` brand shade | 150ms |
| Focus (keyboard) | `focus-visible:ring-2 ring-[--color-lp-orange] ring-offset-1` | instant |
| Active/press | same-or-darker bg, no layout-shifting transform | 150ms |
| Disabled | `opacity-50` + `cursor-not-allowed` + `disabled`/`aria-disabled` | — |
| Loading | spinner, disabled, **width preserved** | — |
| Destructive | `--color-lp-error`, spatially separated from primary | — |

Transitions standardise on the existing `.btn-transition` util (≈150ms) — inside the
skill's 150–300ms micro-interaction window. No control should snap (0ms) or drag (>300ms).

### 3.3 Two more primitives worth extracting (follow-up, not this branch)

- **`<TextInput>` / `<NumberInput>`** — there are 17+ near-identical inline input styles
  (`border border-lp-border bg-lp-surface px-3 py-2 ... focus:border-lp-orange focus:ring-2`).
  The §B1.4 `CurrencyNumericInput` + §P2 rate inputs already prove the pattern; promote
  it to a shared primitive with built-in label + helper + error slots
  (skill `input-labels`, `error-placement`, `inline-validation`).
- **`<Modal>` / dialog shell** — `StageBoxPatchModal`, `DeleteConfirmationModal`,
  `NewSectionDialog` each hand-roll backdrop + scrim + escape handling. The skill flags
  `modal-escape` + scrim opacity 40–60%. One shell, consistent dismiss behaviour.

---

## 4. Cross-app flow observations (25-yr-lead review)

Grounded in the surfaces touched this year (Budget, IA cleanup, Payroll, Channel list,
shells v1/v2):

1. **Two shell systems still coexist** (shell-v1 PageShell + shell-v2 ProductShell).
   IA Cleanup migrated the big surfaces; the remaining v1 pages are a navigation-
   consistency risk (skill `navigation-consistency`: "placement must stay the same
   across all pages"). Finish the v1→v2 retirement.

2. **Save feedback is inconsistent.** Three patterns in use: `SaveStatePill` (rider),
   `SaveStatus` (personnel), silent debounced auto-save (budget). The skill wants one
   `submit-feedback` language. Pick one pill, use everywhere.

3. **Error surfacing varies** — `alert()` (channel list reorder + the §CL1 add-channel
   fix), inline red text (budget transactions), toast (`useToast`). The skill's
   `error-clarity` + `toast-accessibility` want a single channel. Standardise on the
   existing `Toast` (it's already `aria-live`-capable) for transient errors; inline for
   field validation.

4. **Density is now a solved, repeatable pattern** — the §B4/§B5 `createDensity` factory
   is exactly the kind of "actionable template that carries across the app" this audit
   wants more of. Use it as the model for the Button/Input/Modal extractions.

5. **Empty states are thin.** Several grids render bare "no data" text. Skill
   `empty-states` wants message + action. Low effort, high polish-per-line.

---

## 5. Prioritised roadmap

Ordered by (impact ÷ effort), each shippable as its own ~400-LOC commit:

| # | Work | Skill rule(s) | Effort | Why first |
|---|---|---|---|---|
| **1** | Adopt `<Button>` in the **highest-traffic 20 files** (Budget, Payroll, Channel list, slide-overs) | `focus-states` CRITICAL, `style-consistency` | S | Closes the worst a11y gap where users spend most time |
| 2 | Extract `<TextInput>`/`<NumberInput>` + adopt in those same surfaces | `input-labels`, `inline-validation` | M | Second-biggest inline-style cluster |
| 3 | Standardise save feedback on one pill | `submit-feedback` | S | Removes the "did it save?" ambiguity |
| 4 | Standardise transient errors on `Toast`, field errors inline | `error-clarity`, `toast-accessibility` | S | Kills `alert()` |
| 5 | `<Modal>` shell; migrate the 3 hand-rolled dialogs | `modal-escape`, scrim opacity | M | Consistent dismiss + scrim |
| 6 | Sweep remaining 178 files onto `<Button>` (codemod-assisted) | `style-consistency`, `color-semantic` | L | Long tail; do after the pattern is proven |
| 7 | Finish shell-v1 → shell-v2 retirement | `navigation-consistency` | L | Removes the last nav-placement inconsistency |
| 8 | Empty-state pass across grids | `empty-states` | S | Cheap polish |

**Do NOT** big-bang items 1+6 together. Prove the primitive on 20 files (item 1),
let Adam smoke it, then sweep the tail. A 198-file PR is unreviewable and risky.

---

## 6. What shipped on this branch

- `src/components/ui/Button.tsx` — the canonical primitive (reference template). **Not
  yet adopted anywhere** — this branch is the proposal + the tool, so adopting it is a
  reviewable follow-up, not a silent 198-file diff.
- `docs/design/UX_AUDIT_2026.md` — this document.

Nothing else is touched. The app behaves identically; the Button is additive and unused
until a follow-up sprint wires it in.

---

## 7. Appendix — skill provenance

- Skill: `ui-ux-pro-max@2.5.0` (NextLevelBuilder), installed via `/plugin`.
- Generated via `search.py --design-system` + `--domain ux` queries (button states,
  form feedback) against the skill's `ux-guidelines.csv` (99 guidelines) + `styles.csv`.
- The skill's delivery checklist is App-UI-oriented (iOS/Android/RN); the web-relevant
  subset (Accessibility, Touch/Interaction sizing, Style Selection, Typography/Color,
  Forms/Feedback, Navigation Patterns) was applied. Mobile-native-only rules (haptics,
  safe-area, swipe-back) were noted as out-of-scope for the web app.
