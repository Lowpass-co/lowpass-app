# Cursor Prompt — R8: Rider Pack save-freeze fix + visual rebuild

Paste this whole file into Cursor. Execute in order. Do not skip steps. Do not add scope beyond what is listed. If a step is ambiguous, STOP and ask rather than guessing.

---

## Context

R7 landed token replacements and an export 500 fix. Two problems remain:

1. **The editor is functionally unusable.** Every keystroke in a field triggers `saveSelectedSection()` → `updateSection()` (POST) → `refresh()` (full `getPackResolved()` GET) → `setData()` → **full re-render of the whole three-pane editor**. The input remounts, the cursor jumps, and the user loses what they were typing. There is no debouncing. Location: `src/components/rider-pack/PackEditor.tsx` lines 157–172 and lines 377–381.

2. **It still doesn't look modern.** R7 swapped tokens but kept the old structural layout. The two visual baselines we want to match are:
   - **Bug Reports** (`src/components/bug-report/BugReportsClient.tsx`) — top stat strip, rounded-xl cards with inline `var(--lp-*)` tokens, backdrop-blur modals, pill badges with `color + '1a'` fills.
   - **Commissions / Salaries** (`src/components/budget/CommissionsTab.tsx`, `src/components/budget/SalariesTab.tsx`) — `rounded-xl border border-lp-border bg-lp-surface overflow-hidden` table containers, `text-[10px] font-semibold uppercase tracking-widest lp-table-header-text p-3` headers, `hover:bg-lp-surface-hover` body rows, `tabular-nums` for numbers.

R8 fixes both. **No new dependencies. No schema changes. No API contract changes.**

---

## Hard rules

1. **No new dependencies.** Debounce is written with `setTimeout` + `useRef`. Do not add `use-debounce`, `lodash`, or similar.
2. **No DB migrations.** Schema is frozen.
3. **No API contract changes.** `PATCH /api/rider-packs/[id]/sections/[section_id]` keeps its current request/response shape.
4. **Design tokens only.** Use existing `lp-*` Tailwind classes and `var(--lp-*)` CSS variables. Do not invent new tokens. If a shade is missing, STOP and ask.
5. **Strict TypeScript.** Zero `any`, no `@ts-ignore`.
6. **Scoped file list below is authoritative.** Do not touch files outside it.

---

## File list

**Edit (5):**

- `src/components/rider-pack/PackEditor.tsx`
- `src/components/rider-pack/FieldEditors.tsx`
- `src/components/rider-pack/SectionList.tsx` (if present — check with `ls` first)
- `src/components/rider-pack/NewSectionDialog.tsx` (from R7 — backdrop blur tweak only)
- `src/app/(app)/rider-packs/page.tsx`

**New (2):**

- `src/components/rider-pack/useDebouncedSave.ts`
- `src/components/rider-pack/PackStatCards.tsx`

---

## Step 0 — Pre-flight output (A–E)

Before writing any code, output the following. If any check fails, STOP and report.

### A. Last commit on `main`

```
git log --oneline -1
```

### B. R7 actually shipped

```
grep -n "NewSectionDialog" src/components/rider-pack/PackEditor.tsx
grep -cE "neutral-[0-9]+|bg-white\b|bg-gray-[0-9]+" src/components/rider-pack/PackEditor.tsx src/components/rider-pack/FieldEditors.tsx src/components/rider-pack/AssetPicker.tsx 'src/app/(app)/rider-packs/page.tsx'
```

First command must return a hit. Second must be **0**. If either fails, STOP — R7 was not merged.

### C. Files exist

```
ls src/components/rider-pack/PackEditor.tsx
ls src/components/rider-pack/FieldEditors.tsx
ls src/components/rider-pack/NewSectionDialog.tsx
ls src/components/budget/CommissionsTab.tsx
ls src/components/budget/SalariesTab.tsx
ls src/components/bug-report/BugReportsClient.tsx
ls src/components/rider-pack/SectionList.tsx 2>/dev/null || echo "no separate SectionList file — sections rendered inline in PackEditor"
```

### D. Confirm the save-freeze site

```
sed -n '150,180p' src/components/rider-pack/PackEditor.tsx
sed -n '370,395p' src/components/rider-pack/PackEditor.tsx
```

Report both blocks. You're looking for:
- `saveSelectedSection` (calls `updateSection` then `refresh`).
- `onFieldsChange={(fields) => saveSelectedSection({ fields })}`.

If the function names or structure have shifted, STOP and report what you see before continuing.

### E. Confirm the stat-card pattern in BugReports

```
sed -n '519,548p' src/components/bug-report/BugReportsClient.tsx
```

Report the block. You'll reuse this pattern in Step 3.

---

## Step 1 — Create `src/components/rider-pack/useDebouncedSave.ts`

New file. A small generic hook that debounces a save function and tracks its state for a save indicator pill.

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

type Options = {
  /** Delay before firing the save after the last call (ms). */
  delay?: number;
  /** If set, after this many ms the "saved" indicator reverts to "idle". */
  savedHoldMs?: number;
};

/**
 * Debounces an async save function. Returns:
 *  - `schedule(payload)` — call this on every change; the save fires after
 *    `delay` ms of inactivity.
 *  - `flush()` — fire the pending save immediately (e.g. on blur, on unmount).
 *  - `state` — current save state, for rendering a pill indicator.
 *  - `error` — last error message, if state is 'error'.
 *
 * The hook keeps only the LATEST payload. If a new call arrives mid-save,
 * the save re-fires with the latest payload after the in-flight one completes.
 */
export function useDebouncedSave<T>(
  saveFn: (payload: T) => Promise<void>,
  options: Options = {},
) {
  const { delay = 800, savedHoldMs = 1500 } = options;

  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<T | null>(null);
  const inFlightRef = useRef(false);
  const saveFnRef = useRef(saveFn);

  // Keep saveFnRef current without re-triggering the debounce.
  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  const runSave = useCallback(async () => {
    if (inFlightRef.current) return;
    const payload = pendingRef.current;
    if (payload === null) return;

    pendingRef.current = null;
    inFlightRef.current = true;
    setState('saving');
    setError(null);

    try {
      await saveFnRef.current(payload);
      inFlightRef.current = false;

      // If a newer change arrived while we were saving, re-run immediately.
      if (pendingRef.current !== null) {
        void runSave();
        return;
      }

      setState('saved');
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setState('idle'), savedHoldMs);
    } catch (err) {
      inFlightRef.current = false;
      setState('error');
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }, [savedHoldMs]);

  const schedule = useCallback(
    (payload: T) => {
      pendingRef.current = payload;
      setState('pending');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void runSave();
      }, delay);
    },
    [delay, runSave],
  );

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await runSave();
  }, [runSave]);

  // Flush on unmount so unmounted drafts don't get dropped.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        void runSave();
      }
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, [runSave]);

  return { schedule, flush, state, error };
}
```

---

## Step 2 — Rewire `PackEditor.tsx` to stop freezing on keystrokes

Three changes in this file. Do them carefully — this is the most impactful step.

### 2a. Remove the `refresh()` call after section save

Find `saveSelectedSection` (around lines 157–172). It currently looks approximately like:

```tsx
async function saveSelectedSection(patch: Partial<PackSection>) {
  if (!selectedSection) return;
  const updated = await updateSection(pack.id, selectedSection.id, patch);
  await refresh();  // <-- this is the freeze source
}
```

Refactor to:

1. Do **not** call `refresh()` after a field edit. The server update is authoritative for that field; the local data already reflects what the user typed.
2. Instead, merge the server response back into local state (optimistic-safe).
3. Never re-fetch the whole pack on a field edit. `refresh()` is only valid for structural changes (add/delete/reorder section, rename section_key, etc.).

Replacement (adapt names to what actually exists in the file):

```tsx
const saveSection = useCallback(
  async (patch: Partial<PackSection>) => {
    if (!selectedSection) return;
    const updated = await updateSection(pack.id, selectedSection.id, patch);
    // Merge the server response into local state — no refetch.
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === updated.id ? { ...s, ...updated } : s,
        ),
      };
    });
  },
  [selectedSection, pack.id],
);
```

**Do NOT touch** the callers for structural actions (add section, delete section, reorder). Those should continue to call `refresh()` because they change the section list.

### 2b. Wire `useDebouncedSave` around the section save

At the top of `PackEditor`:

```tsx
import { useDebouncedSave } from './useDebouncedSave';
```

Inside the component, after `saveSection` is defined:

```tsx
const sectionSave = useDebouncedSave<Partial<PackSection>>(saveSection, { delay: 800 });
```

Replace the current `onFieldsChange` prop on the field editor (around lines 377–381):

```tsx
// BEFORE (causes freeze):
onFieldsChange={(fields) => saveSelectedSection({ fields })}

// AFTER:
onFieldsChange={(fields) => sectionSave.schedule({ fields })}
onFieldBlur={() => { void sectionSave.flush(); }}
```

`onFieldBlur` is a new optional prop on the section editor — Step 2d adds it.

### 2c. Add a Save-state pill in the editor header

Render a small status pill in the section editor header (or wherever the section title is shown). Place it to the right of the title.

```tsx
<SaveStatePill state={sectionSave.state} error={sectionSave.error} />
```

Define `SaveStatePill` inline at the bottom of `PackEditor.tsx` (or alongside other small helpers already there):

```tsx
function SaveStatePill({
  state,
  error,
}: {
  state: 'idle' | 'pending' | 'saving' | 'saved' | 'error';
  error: string | null;
}) {
  if (state === 'idle') return null;

  const config = {
    pending: { label: 'Unsaved changes', color: 'var(--lp-text-tertiary)' },
    saving: { label: 'Saving…', color: 'var(--lp-text-secondary)' },
    saved: { label: 'Saved', color: 'var(--lp-orange)' },
    error: { label: error || 'Save failed', color: 'var(--lp-error)' },
  }[state];

  return (
    <span
      title={state === 'error' && error ? error : undefined}
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{
        color: config.color,
        border: `1px solid ${config.color}`,
        backgroundColor: 'transparent',
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: config.color }}
      />
      {config.label}
    </span>
  );
}
```

### 2d. Pass `onFieldBlur` through to field editors

Find the field-editor wrapper component (or wherever `onFieldsChange` is currently a prop). Add an optional `onFieldBlur?: () => void;` prop.

Inside each field editor in `FieldEditors.tsx` — `TextEditor`, `LabelInput`, `CurrencyEditor`, any `<input>` / `<textarea>` that accepts user text — add `onBlur={onFieldBlur}` to the native element. If the component already had an `onBlur` handler, call both.

This ensures that when the user tabs out of a field, the pending save flushes immediately rather than waiting the full 800ms.

### 2e. Keep local state ahead of the server — do not overwrite in-flight typing

This is the subtle one. Currently, the field editors may be controlled components that read their value from `pack.sections[i].fields[j].value`. If we update server state asynchronously and the user is still typing, we risk overwriting the input.

Rule: for each field editor, the displayed value should be the **local draft** (component state), not the prop from the server. Sync the local draft **from** the prop only on:

1. Initial mount.
2. When the prop value changes AND the local draft hasn't been edited since the last save finished.

Simplest correct pattern (apply to each text/number field editor in `FieldEditors.tsx`):

```tsx
const [draft, setDraft] = useState(value);

// If the server value changes and we are not mid-edit, adopt it.
useEffect(() => {
  setDraft(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [value]);
```

Do this only for text/textarea/number inputs. Select dropdowns and boolean toggles are fine controlled from props — they don't have the typing-race problem.

---

## Step 3 — Build `PackStatCards.tsx`

New client component. Renders 4 stat cards at the top of the editor, matching the Bug Reports `grid grid-cols-2 gap-3 sm:grid-cols-4` pattern.

```tsx
'use client';

type Props = {
  sectionCount: number;
  fieldCount: number;
  updatedAt: string | null;
  exportStatus: 'never' | 'exported';
  shareLinkCount: number;
};

export function PackStatCards({
  sectionCount,
  fieldCount,
  updatedAt,
  exportStatus,
  shareLinkCount,
}: Props) {
  const cards = [
    { label: 'Sections', value: String(sectionCount), color: 'var(--lp-text)' },
    { label: 'Fields', value: String(fieldCount), color: 'var(--lp-text)' },
    {
      label: 'Last edit',
      value: updatedAt ? formatRelative(updatedAt) : '—',
      color: 'var(--lp-text-secondary)',
    },
    {
      label: 'Google Doc',
      value: exportStatus === 'exported' ? 'Exported' : 'Not exported',
      color: exportStatus === 'exported' ? 'var(--lp-orange)' : 'var(--lp-text-tertiary)',
    },
    {
      label: 'Share links',
      value: String(shareLinkCount),
      color: 'var(--lp-text)',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl px-4 py-3"
          style={{
            backgroundColor: 'var(--lp-surface)',
            border: '1px solid var(--lp-border)',
          }}
        >
          <div
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--lp-text-tertiary)' }}
          >
            {c.label}
          </div>
          <div className="text-2xl font-bold" style={{ color: c.color }}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const diff = Date.now() - then;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
```

Render it in `PackEditor.tsx` above the three-pane layout. Compute props from existing `data`:

- `sectionCount`: `data.sections.length`
- `fieldCount`: sum of `section.fields.length` across all sections
- `updatedAt`: `pack.updated_at`
- `exportStatus`: `pack.google_doc_url ? 'exported' : 'never'`
- `shareLinkCount`: length of share-links array (already fetched in the editor; if not, pass 0 for now — don't add a new fetch)

---

## Step 4 — Rebuild the section field list as a Commissions-style table

Inside `PackEditor.tsx`, find where the selected section's fields are rendered (the middle pane). Wrap it in a Commissions-style card:

```tsx
<div
  className="overflow-hidden rounded-xl border"
  style={{
    backgroundColor: 'var(--lp-surface)',
    borderColor: 'var(--lp-border)',
  }}
>
  {/* Section header */}
  <div
    className="flex items-center justify-between border-b px-4 py-3"
    style={{ borderColor: 'var(--lp-border)' }}
  >
    <div className="flex items-center gap-3">
      <h2 className="text-sm font-semibold text-lp-text">
        {selectedSection.title}
      </h2>
      <SaveStatePill state={sectionSave.state} error={sectionSave.error} />
    </div>
    {/* existing action buttons (rename, delete, etc.) stay here */}
  </div>

  {/* Field rows */}
  <div className="divide-y" style={{ borderColor: 'var(--lp-border)' }}>
    {selectedSection.fields.map((field) => (
      <div
        key={field.id}
        className="px-4 py-3 transition-colors hover:bg-lp-surface-hover"
      >
        {/* existing field editor goes here */}
      </div>
    ))}
  </div>
</div>
```

Notes:
- The existing field editor components (`TextEditor`, `LabelInput`, etc.) render inside each row. Do not rewrite them — just wrap them.
- `divide-y` + inline `borderColor` — if Tailwind doesn't apply the inline colour to `divide-y` children, replace with explicit `<div className="border-b last:border-b-0" style={{ borderColor: 'var(--lp-border)' }}>` per row.

---

## Step 5 — Redesign `/rider-packs` index page to match

Edit `src/app/(app)/rider-packs/page.tsx`. R7 already themed it. Now add the stat strip and Commissions-style list container.

### 5a. Stat strip at top

Below the header, above the "New artist pack" section, render:

```tsx
<PackStatCards
  sectionCount={0 /* not applicable on index */}
  fieldCount={0}
  updatedAt={null}
  exportStatus="never"
  shareLinkCount={0}
/>
```

Actually — the index page doesn't need per-pack stats. Instead, show **workspace-level** stats:

```tsx
<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
  {[
    { label: 'Packs', value: String(packs?.length ?? 0) },
    { label: 'Artists', value: String(artists?.length ?? 0) },
    {
      label: 'Recently edited',
      value: packs?.[0]
        ? new Date(packs[0].updated_at).toLocaleDateString()
        : '—',
    },
    {
      label: 'Exports',
      value: String(packs?.filter((p) => p.google_doc_id).length ?? 0),
    },
  ].map((c) => (
    <div
      key={c.label}
      className="rounded-xl px-4 py-3"
      style={{
        backgroundColor: 'var(--lp-surface)',
        border: '1px solid var(--lp-border)',
      }}
    >
      <div
        className="text-[11px] font-bold uppercase tracking-wider"
        style={{ color: 'var(--lp-text-tertiary)' }}
      >
        {c.label}
      </div>
      <div className="text-2xl font-bold" style={{ color: 'var(--lp-text)' }}>
        {c.value}
      </div>
    </div>
  ))}
</div>
```

(This query already exists — `packs` is fetched in the server component. Filter adds zero runtime cost.)

Do NOT render `<PackStatCards>` on this page — that component is for the per-pack editor.

### 5b. Packs list as Commissions-style table

Replace the current list with a proper table-feeling card:

```tsx
<section
  className="overflow-hidden rounded-xl border"
  style={{
    backgroundColor: 'var(--lp-surface)',
    borderColor: 'var(--lp-border)',
  }}
>
  {/* Header row */}
  <div
    className="grid items-center gap-3 border-b px-4 py-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text"
    style={{
      gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) 100px 140px',
      borderColor: 'var(--lp-border)',
    }}
  >
    <div>Pack</div>
    <div>Artist</div>
    <div>Scope</div>
    <div className="text-right">Updated</div>
  </div>

  {/* Body rows */}
  {packs && packs.length > 0 ? (
    packs.map((p) => (
      <Link
        key={p.id}
        href={`/rider-packs/${p.id}`}
        className="grid cursor-pointer items-center gap-3 border-b px-4 py-3 transition-colors hover:bg-lp-surface-hover"
        style={{
          gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) 100px 140px',
          borderColor: 'var(--lp-border)',
        }}
      >
        <div className="truncate text-sm font-semibold text-lp-text">
          {p.title || '(untitled)'}
        </div>
        <div className="truncate text-sm text-lp-text-secondary">
          {artistMap.get(p.artist_id) ?? 'Unknown artist'}
        </div>
        <div>
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
            style={{
              backgroundColor: 'var(--lp-orange)' + '1a',
              color: 'var(--lp-orange)',
              border: '1px solid ' + 'var(--lp-orange)' + '33',
            }}
          >
            {p.scope}
          </span>
        </div>
        <div className="text-right text-[11px] text-lp-text-tertiary tabular-nums">
          {new Date(p.updated_at).toLocaleDateString()}
        </div>
      </Link>
    ))
  ) : (
    <div className="px-4 py-10 text-center text-sm text-lp-text-secondary">
      No packs yet. Create one above.
    </div>
  )}
</section>
```

**Known issue to verify:** the pill `backgroundColor: 'var(--lp-orange)' + '1a'` is a JS string-concat — this produces the string `"var(--lp-orange)1a"`, which is invalid CSS.

Fix: use the actual hex. From `src/app/globals.css`, `--color-lp-orange` is `#FF4500`. So:

```tsx
style={{
  backgroundColor: '#FF45001a',
  color: '#FF4500',
  border: '1px solid #FF450033',
}}
```

Apply the same correction everywhere in this PR and in R7's pill patterns if the previous author made the same mistake. Search for `'var(--lp-orange)' +` and replace with the `#FF4500` hex variant. **This is a required correctness fix, not style.**

---

## Step 6 — Backdrop blur on `NewSectionDialog`

Edit `src/components/rider-pack/NewSectionDialog.tsx`. The R7 version uses `rgba(0,0,0,0.5)` for the backdrop. Upgrade to the Bug Reports style:

```tsx
<div
  className="fixed inset-0 z-50 flex items-center justify-center"
  style={{
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
  }}
  onClick={onClose}
>
  <div
    onClick={(e) => e.stopPropagation()}
    className="mx-4 w-full max-w-md rounded-xl p-5"
    style={{
      backgroundColor: 'var(--lp-surface)',
      border: '1px solid var(--lp-border)',
      boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
    }}
  >
    {/* existing modal content */}
  </div>
</div>
```

Nothing else changes in this component.

---

## Step 7 — Verification

```
grep -cE "neutral-[0-9]+|bg-white\b|bg-gray-[0-9]+" src/components/rider-pack/PackEditor.tsx src/components/rider-pack/FieldEditors.tsx src/components/rider-pack/AssetPicker.tsx 'src/app/(app)/rider-packs/page.tsx' 'src/app/(app)/rider-packs/[id]/page.tsx'
```

Target: **0**.

```
grep -n "'var(--lp-orange)' +" src/components/rider-pack/ src/app/\(app\)/rider-packs/
```

Target: **no matches** (the broken string-concat bug).

```
grep -n "await refresh()" src/components/rider-pack/PackEditor.tsx
```

Target: `refresh()` should ONLY be awaited in structural actions (add section, delete section, reorder, rename section_key). It should NOT appear inside any field-save path. Report every match and annotate which action it belongs to.

```
npx tsc --noEmit
npx eslint src/components/rider-pack/ 'src/app/(app)/rider-packs/'
npx next build
```

All three must pass clean. Report the final 10 lines of `next build`.

### Manual sanity checks (required before commit)

1. Open a pack, click into any text field, type **three full sentences without pausing**. The input must not freeze, jump, or lose focus. The "Saved" pill should appear 800ms after you stop typing — not during.
2. Tab out of a field. The save should flush immediately (pill goes `pending` → `saving` → `saved` within 300ms, not after the 800ms debounce window).
3. Disconnect the network (DevTools → Network → Offline), type something, wait. The pill should go to `error` with a readable message.
4. Re-online, type again. Pill should recover and show `saved`.
5. Add a new section (via the R7 dialog). Confirm the section list updates — this path SHOULD call `refresh()` and is allowed to re-render.
6. Visually, the editor should now have: stat strip at top, Commissions-style field list card, backdrop-blurred new-section dialog. The `/rider-packs` index should have: 4 stat cards, a proper tabular packs list.

---

## Final report format

Echo back exactly the following sections:

**Step 0 — Pre-flight output (A–E):** (paste outputs)

**Step 7 — Verification output:**
- Final neutral-token debt count (must be 0)
- `'var(--lp-orange)' +` match count (must be 0)
- `await refresh()` match count + annotations (structural actions only)
- `tsc --noEmit` exit code
- `eslint` exit code + warnings/errors count
- `next build` last 10 lines

**Typing stress-test result:** paste what happened when you typed three sentences in a field. Did the cursor jump, freeze, or stay stable? (This is the user-facing acceptance criterion.)

**`git status -u --short`:** (paste)

**Any deviation from this prompt:** (if any — e.g. if the freeze had a different root cause, if a token was missing, if the `refresh()` call existed in a place not described here)

**Final commit SHA:** (after you commit)

**Anything stopped on:** (or "nothing")

---

## Commit message

```
feat(rider-pack): fix save-freeze + visual rebuild matching design baselines (R8)

Save behaviour (the urgent fix)
- Remove await refresh() from every field-save path — it was refetching
  the entire pack and remounting the editor on every keystroke, causing
  the form to appear frozen.
- New useDebouncedSave hook: 800ms debounce with flush-on-blur, correctly
  coalesces in-flight saves with newer payloads.
- Field editors now hold local draft state so typing is never overwritten
  by server round-trips.
- Save-state pill in section header: pending → saving → saved → (idle).
  Error state surfaces the server message.

Visual rebuild
- PackStatCards component: Bug Reports-style 5-card strip at the top of
  the editor (sections / fields / last edit / doc / share links).
- Field list rebuilt as a Commissions/Salaries-style rounded-xl card with
  border-b rows and hover:bg-lp-surface-hover.
- /rider-packs index: 4-card workspace stat strip + tabular packs list
  with scope pill badges and tabular-nums dates.
- NewSectionDialog: backdrop-blur(4px) over rgba(0,0,0,0.55), rounded-xl
  modal with box-shadow, matching the Bug Reports modal treatment.
- Fixed a latent CSS bug in R7's pill styles: 'var(--lp-orange)' + '1a'
  string-concatenation produces invalid CSS; replaced with the #FF4500
  hex equivalent everywhere.

No dependency changes. No schema changes. No API contract changes.
```
