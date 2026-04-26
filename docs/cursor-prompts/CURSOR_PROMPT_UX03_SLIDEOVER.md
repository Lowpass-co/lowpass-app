# UX03 — SlideOver Universalisation

> Builds the universal `<SlideOver>` primitive and ports the existing Bug Reports slide-over pattern onto it. Establishes the **context-only** rule (slide-over never holds primary edit fields) and produces a contract document at `docs/components/SLIDE_OVER_CONTRACT.md`.

---

## 0. Context for Cursor

Read first:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — section 3.3 (slide-over panel — context only).
2. `docs/design-tokens.md` (UX01).
3. `src/components/bug-report/BugReportsClient.tsx` — current pattern. The user has called this out as the gold-standard implementation. The new `<SlideOver>` must match its visual feel, not change it.
4. UX02 (must be merged first). PageShell exists. `<SlideOver>` mounts above PageShell content via portal.

---

## 1. Why this prompt exists

Right now Bug Reports is the only page using a right-side slide-over, and the implementation is inline. Other pages either use full-page detail views (loses context) or modals (heavy, takes over the screen). The roadmap says **slide-over is the universal context panel** — every list-archetype page uses it on row click, and every line-item context (notes, files, receipts, comments, math) lives in it.

Crucial design constraint: **slide-over is for context only, never for primary edits.** Routing and channel list stay fully on-page. Budget edits inline; clicking a budget line opens a slide-over for *notes/files/receipts/team chat/math* — not for editing the line's $ amount.

---

## 2. Hard rules

1. **No new dependencies.** No `@radix-ui`, no `react-modal`, no `framer-motion`. Use existing `lucide-react` icons + native CSS animations defined in `globals.css`.
2. **Slide-over never contains the primary editable fields of the record.** Enforce this in the contract doc and through component API design (slot names below).
3. **Always portal-mounted** so it sits above PageShell stacking context. Use `createPortal` to `document.body`.
4. **Backdrop-less variant supported** — slide-over may overlay PageShell without a darkening scrim, leaving the underlying page visible and printable. Default is no backdrop. Pages can opt-in to a backdrop for high-stakes flows.
5. Closes via: Escape key, backdrop click (if present), explicit close button, programmatic `onClose` call.
6. Locked focus while open. Focus trap + return focus to opener on close.
7. Animates in/out using `--lp-duration-slower` + `--lp-ease-emphasized`. Reuse existing keyframes if appropriate; otherwise add new ones.
8. z-index: `--lp-z-slide-over` for the panel, `--lp-z-slide-over-backdrop` for the backdrop.
9. Width: `--lp-slideover-width` (480px) default, `--lp-slideover-width-wide` (640px) opt-in.
10. Mobile (< 640px): becomes a full-height bottom sheet, not a side panel. Same API.

---

## 3. Step 1 — `<SlideOver>` component

File: `src/components/shell/SlideOver.tsx` (`'use client'`)

### 3.1 Props

```ts
type SlideOverProps = {
  open: boolean;
  onClose: () => void;
  // Header slots (top of the panel)
  title: string;
  subtitle?: string;
  headerActions?: ReactNode; // top-right buttons (e.g. delete, more)
  // Body — the consumer controls everything below the header
  children: ReactNode;
  // Optional footer (e.g. action row)
  footer?: ReactNode;
  // Width
  width?: 'default' | 'wide';
  // Backdrop
  backdrop?: boolean; // default false
  // ARIA
  ariaLabel?: string; // defaults to title
};
```

### 3.2 Layout

```
┌─────────────────────────────────────────┐
│  Header (title, subtitle, headerActions, close button)   ← --lp-space-4 padding, --lp-border bottom
├─────────────────────────────────────────┤
│                                         │
│  Body (children, scrollable)            ← --lp-space-4 padding, flex-1, overflow-y auto
│                                         │
├─────────────────────────────────────────┤
│  Footer (optional)                       ← --lp-space-4 padding, --lp-border top
└─────────────────────────────────────────┘
```

- Background: `--lp-surface` (lighter than the page's `--lp-bg`)
- Right edge attached to viewport; left edge has shadow `--lp-shadow-overlay`
- `border-radius: --lp-radius-xl 0 0 --lp-radius-xl` (rounded only on left side; on mobile, rounded top corners only)
- Position: `fixed; right: 0; top: 0; height: 100vh; width: var(--lp-slideover-width-{default|wide})`

### 3.3 Animation

Enter: `transform: translateX(100%) → 0` over `--lp-duration-slower` with `--lp-ease-emphasized`. Backdrop (if any) fades in over `--lp-duration-slow`.

Exit: reverse. After exit completes, unmount via React state.

Mobile: `transform: translateY(100%) → 0` (bottom sheet).

### 3.4 Focus trap

Trap focus within the panel while open. On open, focus the close button (or first focusable in `headerActions` if it's marked `data-autofocus`). On close, return focus to the element that had focus when the panel opened.

Implement focus trap manually with a small internal hook — no library. Listen for `Tab`/`Shift+Tab` and cycle within `[role="dialog"]` descendants.

### 3.5 Keyboard

- `Escape` → `onClose()`
- `Tab` / `Shift+Tab` → trap within
- No other shortcuts

### 3.6 ARIA

`role="dialog"`, `aria-modal="true"`, `aria-label={ariaLabel ?? title}`. Title element has `id="slide-over-title"` and is referenced by `aria-labelledby` on the dialog root.

### 3.7 Body slot conventions (documented but not enforced by code)

The contract doc (§5) prescribes these subsections inside `children`. Components consuming SlideOver should follow them, but `<SlideOver>` itself just renders whatever's passed.

Standard sections (in this order):
1. **Notes** — rich text or plain markdown editor
2. **Attachments** — file list + upload
3. **Receipts** (where applicable) — linked Expense entities
4. **Comments** — threaded discussion
5. **Activity** — system-generated audit log
6. **Math** (where applicable) — running calculator/scratchpad

---

## 4. Step 2 — Port Bug Reports onto `<SlideOver>`

The Bug Reports page already has slide-over behaviour built inline. Refactor to use the new primitive.

### 4.1 Find the inline implementation

In `src/components/bug-report/BugReportsClient.tsx` (and any sibling files), locate the existing right-side panel/drawer. Replace it with `<SlideOver>`.

### 4.2 Map existing fields to slots

- Title → bug title or ID
- Subtitle → status pill + reporter name + created date
- Header actions → existing action buttons (assign, status change, etc.) **stay in the slide-over because Bug Reports is an admin tool whose primary edit surface IS this panel**. Document this as the **single exception** to the context-only rule (admin tools may break the rule when the record has no other surface).
- Body → existing comments / activity / details

### 4.3 Visual diff acceptance

The user has called the current Bug Reports panel "great". After the refactor:
- Open Bug Reports
- Click a row
- The panel should look **visually identical or better** — same proportions, same spacing, same colours, same animation feel

If the refactor introduces any visual regression, fix it before committing.

---

## 5. Step 3 — Contract doc

Create `docs/components/SLIDE_OVER_CONTRACT.md`:

```markdown
# SlideOver Contract

> The slide-over is for **context, not editing**. Read this before adding a slide-over to any page.

## When to use SlideOver
- Showing supplementary detail about a list item without leaving the list
- Holding notes, files, receipts, comments, math, activity for a record
- Quick lookup of a referenced entity (Person, Flight, Room, Gear) via EntityChip click (UX08)

## When NOT to use SlideOver
- As the primary edit surface for the record's main fields
- For pages designed to be printed (Routing, Channel List)
- For form-heavy creation flows (use a full page or a Modal)
- For confirmation dialogs (use a Modal)

## Allowed exceptions
- Admin tools whose record exists nowhere else (Bug Reports). Document the exception in code with a comment.

## Standard body sections
[copy the §3.7 list]

## API
[copy the props from §3.1]

## Anti-patterns
- Don't put save buttons inside the slide-over for fields that exist on the page (the page edits inline)
- Don't render two slide-overs at once
- Don't use SlideOver for left-side panels (it's right-only)
- Don't inline-implement a slide-over; always use this component
```

---

## 6. Step 4 — Playground showcase

Add a slide-over demo to `/admin/shell-playground` (created in UX02). Add a button "Open SlideOver demo" that opens a sample slide-over with:
- Title: "Britannia Row Audio Rental"
- Subtitle: "£12,500.00 · Expense · 12 Aug 2026"
- Body: placeholders for Notes / Attachments / Comments
- Footer: "View source" button (no-op)

Two demo modes: default (no backdrop) and wide+backdrop (toggle via dropdown).

---

## 7. Verification

1. `npm run lint` + `npm run typecheck` clean
2. Bug Reports slide-over visually matches the previous implementation
3. Playground demos work, including wide variant and backdrop toggle
4. Escape closes
5. Tab cycles within the panel
6. Focus returns to the trigger on close
7. Mobile width: panel becomes a bottom sheet at <640px
8. Open dev tools, click outside the panel (no backdrop) → panel stays open
9. Open dev tools, click backdrop (with backdrop) → panel closes
10. Animations play in both directions; component unmounts after exit

---

## 8. Acceptance criteria

- [ ] `src/components/shell/SlideOver.tsx` exists with the API above
- [ ] Bug Reports refactored to use it; visual parity confirmed
- [ ] Contract doc at `docs/components/SLIDE_OVER_CONTRACT.md`
- [ ] Mobile bottom-sheet behaviour at <640px
- [ ] Focus trap works; Escape closes; focus returns to opener
- [ ] No new dependencies
- [ ] No visual regression on Bug Reports
- [ ] Lint + typecheck clean

---

## 9. Out of scope

- ❌ Don't add SlideOver to any other page — UX13 does that
- ❌ Don't build EntityChip (UX08) or Command Palette (UX08b)
- ❌ Don't change Bug Reports' fields, only the panel chrome

---

## 10. Commit plan

```
UX03: SlideOver primitive + Bug Reports port

- Add src/components/shell/SlideOver.tsx
- Refactor BugReportsClient to use SlideOver (visual parity)
- Add docs/components/SLIDE_OVER_CONTRACT.md
- Playground demo at /admin/shell-playground
- Mobile bottom-sheet variant
```
