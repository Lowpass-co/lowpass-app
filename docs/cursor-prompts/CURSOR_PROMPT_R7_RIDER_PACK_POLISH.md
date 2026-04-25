# Cursor Prompt — R7: Rider Pack polish & export 500 fix

Paste this whole file into Cursor. Execute in order. Do not skip steps. Do not add scope beyond what is listed. If a step is ambiguous, STOP and ask rather than guessing.

---

## Context

R1–R6 shipped the Rider/Pack feature end-to-end (DB, API, editor, public links, Google Doc export, sidebar nav). But the UI is a mess:

- The editor doesn't use Lowpass design tokens (`var(--lp-*)`). It uses raw `neutral-*` Tailwind classes, which read as light-mode white-on-white and clash with every other page.
- Field text inputs are tiny (80px min height for long-form text). Hard to type more than a sentence.
- Section creation uses a native `window.prompt()` dialog — looks like 2004.
- Google Doc export returns **HTTP 500** in production. The route only wraps the Google API calls in try/catch; env var failures (`getGoogleAuth`), pack resolution (`resolvePack`), and the audit-log insert all bubble as framework 500s with no useful message.
- The name "Rider / Pack" (with spaces around the slash) is grammatically weird. Standard term is **"Rider Packs"**.

**Design baseline: the Bug Report tab** (`src/components/bug-report/BugReportsClient.tsx`). That file uses `var(--lp-*)` tokens inline, `rounded-xl` stat cards, `text-[10px] uppercase tracking-widest` labels, `var(--lp-orange)` action buttons, and pill badges with `color + '1a'` backgrounds. Everything below should match that visual language.

This PR is UI polish + one server-side fix. **No logic changes to the rider-pack data model, no API contract changes, no new migrations, no new dependencies.**

---

## Hard rules

1. **No new dependencies.** Everything used here is already in `package.json`.
2. **No DB migrations.** Schema is frozen.
3. **No API contract changes.** The export endpoint still accepts `POST` and returns `{ document_id, document_url, is_new }` on success. Error shape changes are fine (adding `code` field is OK) but the success shape must not change.
4. **Design tokens only.** Replace `neutral-*`, raw `#hex`, `bg-white`, `bg-gray-*`, `text-gray-*`, `border-gray-*` with `var(--lp-*)` tokens or the Tailwind `lp-*` utility classes (`bg-lp-surface`, `border-lp-border`, `text-lp-text`, etc.). When a token doesn't exist, use inline `style={{ ... }}` with `var(--lp-*)` — do **not** invent new tokens.
5. **Strict TypeScript.** Zero `any`, no `@ts-ignore`.
6. **Scoped file list below is authoritative.** Do not touch files not listed here.

---

## File list

**Edit (8):**

- `src/app/api/rider-packs/[id]/export/google-doc/route.ts`
- `src/lib/google/auth.ts`
- `src/components/rider-pack/PackEditor.tsx`
- `src/components/rider-pack/FieldEditors.tsx`
- `src/components/rider-pack/AssetPicker.tsx`
- `src/app/(app)/rider-packs/page.tsx`
- `src/app/(app)/rider-packs/[id]/page.tsx`
- `src/components/layout/Sidebar.tsx`

**New (1):**

- `src/components/rider-pack/NewSectionDialog.tsx`

---

## Step 0 — Pre-flight output (A–E)

Before writing any code, output the following. If any check fails, STOP and report.

### A. Last commit on `main`

```
git log --oneline -1
```

### B. Files exist

```
ls src/app/api/rider-packs/\[id\]/export/google-doc/route.ts
ls src/lib/google/auth.ts
ls src/components/rider-pack/PackEditor.tsx
ls src/components/rider-pack/FieldEditors.tsx
ls src/components/rider-pack/AssetPicker.tsx
ls 'src/app/(app)/rider-packs/page.tsx'
ls 'src/app/(app)/rider-packs/[id]/page.tsx'
ls src/components/layout/Sidebar.tsx
ls src/components/bug-report/BugReportsClient.tsx
```

All must exist.

### C. Current line counts

```
wc -l src/components/rider-pack/PackEditor.tsx
wc -l src/components/rider-pack/FieldEditors.tsx
wc -l src/components/rider-pack/AssetPicker.tsx
wc -l src/app/api/rider-packs/\[id\]/export/google-doc/route.ts
```

### D. Neutral-token debt count (will be zero by end of PR)

```
grep -cE "neutral-[0-9]+|bg-white\b|bg-gray-[0-9]+|text-gray-[0-9]+|border-gray-[0-9]+" src/components/rider-pack/PackEditor.tsx src/components/rider-pack/FieldEditors.tsx src/components/rider-pack/AssetPicker.tsx 'src/app/(app)/rider-packs/page.tsx' 'src/app/(app)/rider-packs/[id]/page.tsx'
```

Report the total. Target after PR: **0** across these files.

### E. Current native prompt() call

```
grep -n "window.prompt\|^\s*prompt(" src/components/rider-pack/PackEditor.tsx
```

Report the line numbers. You'll replace this with the new dialog in Step 3.

---

## Step 1 — Fix HTTP 500 on Google Doc export

### 1a. Harden `src/lib/google/auth.ts`

Currently throws a generic error if env vars are missing. Change it to throw a specific, tagged error so the route handler can surface a useful message.

Replace the env check in `getGoogleAuth` with:

```ts
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

if (!email) {
  throw new GoogleAuthConfigError('GOOGLE_SERVICE_ACCOUNT_EMAIL is not set');
}
if (!rawKey) {
  throw new GoogleAuthConfigError('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not set');
}
```

At the top of the file, add a named error class:

```ts
export class GoogleAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleAuthConfigError';
  }
}
```

Also validate the private key format. After `const privateKey = rawKey.replace(/\\n/g, '\n');`, add:

```ts
if (!privateKey.includes('BEGIN PRIVATE KEY')) {
  throw new GoogleAuthConfigError(
    'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY does not look like a PEM key (missing BEGIN PRIVATE KEY header). Check the .env value was copied correctly.',
  );
}
```

### 1b. Wrap the whole export handler

Edit `src/app/api/rider-packs/[id]/export/google-doc/route.ts`.

The current file only wraps the Google API calls in try/catch (lines 57–123). Env failures from `getDocsClient()`/`getDriveClient()` (lines 50–51), pack resolution (line 46), and the final `rider_pack_exports` insert (lines 125–141) all bubble as framework 500s.

Restructure so the **entire handler body after auth** is inside one outer try/catch. Specifically:

1. Keep the unauthorized check (401) outside the try.
2. Keep the "Pack not found" check (404) outside the try.
3. Move `resolvePack`, `buildExport`, `getDocsClient`, `getDriveClient`, all Google API calls, and the `rider_pack_exports` insert **inside** the try.
4. In the catch, branch on error type:

```ts
} catch (err) {
  const message = err instanceof Error ? err.message : 'Export failed';
  console.error('[rider-packs/export/google-doc] failed', err);

  if (err instanceof GoogleAuthConfigError) {
    return NextResponse.json(
      { error: message, code: 'GOOGLE_AUTH_CONFIG' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { error: message, code: 'GOOGLE_API_ERROR' },
    { status: 502 },
  );
}
```

Import `GoogleAuthConfigError` at the top of the route file.

The `appendHistory` call (lines 143–160) is already in its own try/catch — leave it.

### 1c. Surface the error message in the UI

In `PackEditor.tsx`, find the `ExportPanel` component's `onClick` handler for the Google Doc export. Currently it likely shows a generic "Export failed" message or the raw `res.statusText`. Replace with:

```ts
const res = await fetch(`/api/rider-packs/${packId}/export/google-doc`, { method: 'POST' });
const body = await res.json().catch(() => ({}));

if (!res.ok) {
  const detail = body?.error || res.statusText || 'Export failed';
  setError(detail);
  return;
}
```

If there is no `setError` local state yet, add one (`const [error, setError] = useState<string | null>(null);`) and render it in the panel per Step 7.

---

## Step 2 — Rebrand "Rider / Pack" → "Rider Packs"

Do a find-and-replace across **only** these files (don't touch tests, docs, migrations, or anywhere else):

- `src/components/layout/Sidebar.tsx` — label `'Rider / Pack'` → `'Rider Packs'`
- `src/app/(app)/rider-packs/page.tsx` — `<h1>Rider / Pack</h1>` → `<h1>Rider Packs</h1>`
- `src/app/(app)/rider-packs/[id]/page.tsx` — breadcrumb `← Rider / Pack` → `← Rider Packs`

That's three string replacements, three files. Do not rename files, routes, API endpoints, DB columns, or component names. URLs stay `/rider-packs` (already correct).

---

## Step 3 — Replace `window.prompt()` with an in-app dialog

### 3a. Create `src/components/rider-pack/NewSectionDialog.tsx`

New client component. Props:

```ts
type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (args: { sectionKey: string; title: string }) => void;
};
```

Behaviour:

- Renders a centred modal (fixed position, dark-tinted backdrop that closes on click).
- Two inputs: "Section key" (lowercase, no spaces — slug) and "Title" (free text).
- `sectionKey` auto-derives from `title` as the user types (lowercase, non-alphanumeric → `-`, trim leading/trailing `-`), but is editable.
- Submit button disabled until both fields are non-empty.
- Cancel button closes without calling `onSubmit`.
- `Esc` closes the dialog. `Enter` in the title input submits when valid.

Styling (match BugReportsClient baseline):

- Modal container: `rounded-xl` with `style={{ backgroundColor: 'var(--lp-surface)', border: '1px solid var(--lp-border)' }}`, padding `p-5`, max width `max-w-md`.
- Title: `text-sm font-semibold text-lp-text`.
- Input labels: `text-[10px] uppercase tracking-widest text-lp-text-tertiary`.
- Inputs: `w-full rounded border px-3 py-2 text-sm` with inline style `{ backgroundColor: 'var(--lp-bg-secondary)', borderColor: 'var(--lp-border)', color: 'var(--lp-text)' }`.
- Primary button: `rounded bg-[var(--lp-orange)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50`.
- Secondary button: `rounded px-3 py-1.5 text-xs` with `style={{ color: 'var(--lp-text-secondary)' }}` and `border border-lp-border`.
- Backdrop: `fixed inset-0 z-50 flex items-center justify-center` with inline `style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}`.

Export as default.

### 3b. Wire up in `PackEditor.tsx`

Find the existing `prompt()`-based section-creation logic (around lines 82–84 per pre-flight step E). Replace with:

- A state variable `const [newSectionOpen, setNewSectionOpen] = useState(false);`.
- The button that previously called `prompt()` now calls `setNewSectionOpen(true)`.
- Render `<NewSectionDialog open={newSectionOpen} onClose={() => setNewSectionOpen(false)} onSubmit={...} />` at the bottom of the editor JSX.
- `onSubmit` runs the same section-creation logic that was previously gated behind the `prompt()` result, then calls `setNewSectionOpen(false)`.

No change to the underlying create-section fetch/Supabase call — only the input gathering.

---

## Step 4 — Theme pass on `FieldEditors.tsx`

This file currently has ~90 occurrences of `neutral-*`, `bg-white`, `bg-neutral-50`, and `border-neutral-200`. Replace **all** of them. Mapping:

| Current | Replace with |
|---|---|
| `bg-white` | `bg-lp-surface` |
| `bg-neutral-50` | `bg-lp-bg-secondary` |
| `bg-neutral-100` | `bg-lp-surface-hover` |
| `border-neutral-200` | `border-lp-border` |
| `border-neutral-300` | `border-lp-border` |
| `text-neutral-500` | `text-lp-text-tertiary` |
| `text-neutral-600` | `text-lp-text-secondary` |
| `text-neutral-700` / `text-neutral-800` / `text-neutral-900` | `text-lp-text` |
| `focus:border-neutral-300` | `focus:border-lp-orange` |
| `focus:ring-neutral-300` | `focus:ring-lp-orange` |
| `hover:bg-neutral-50` | `hover:bg-lp-surface-hover` |
| `divide-neutral-200` | `divide-lp-border` |

If you encounter a token shade not in the mapping above, STOP and ask — don't guess.

### 4a. Upgrade TextEditor (long-form text field)

Find the `TextEditor` component in this file. Currently the `<textarea>` has `min-h-[80px]` or similar — too small for rider contents.

Change to:

- `min-h-[200px]` on the textarea.
- Auto-resize: on `onChange`, set `e.currentTarget.style.height = 'auto'` then `e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'`. Guard with a null check on the element.
- `resize-y` (allow user to drag-resize vertically, disallow horizontal).
- `leading-relaxed text-sm` for readability.
- Focus state: `focus:outline-none focus:ring-2 focus:ring-[var(--lp-orange)] focus:border-transparent`.

Any `<input>` single-line fields (e.g. `LabelInput`) get the same focus treatment but keep their current height.

### 4b. Card wrapper tone

The wrapper at line ~50 (`rounded-md border border-neutral-200 bg-white p-3`) should become:

```tsx
<div
  className="rounded-lg border p-4"
  style={{ backgroundColor: 'var(--lp-surface)', borderColor: 'var(--lp-border)' }}
>
```

Bump `rounded-md` → `rounded-lg` and `p-3` → `p-4` for consistency with BugReport cards.

---

## Step 5 — Theme pass on `AssetPicker.tsx`

Same mapping table as Step 4. Replace every `neutral-*` / raw `bg-white` / `border-gray-*` / `text-gray-*` occurrence. No behavioural changes to the picker logic (upload, select, preview). Only visual tokens.

When the preview thumbnail has a hard-coded background (likely `bg-neutral-100`), use `bg-lp-bg-secondary`.

---

## Step 6 — Redesign `/rider-packs` index page

Edit `src/app/(app)/rider-packs/page.tsx`.

Current layout: a header, a `NewPackForm` section, then a plain list. Keep that structure, but restyle to match BugReportsClient's list pattern.

### 6a. Header

```tsx
<header className="space-y-1">
  <h1 className="text-2xl font-bold text-lp-text">Rider Packs</h1>
  <p className="text-sm text-lp-text-secondary">
    Build, edit, and share rider packs across artists, tours, and shows.
  </p>
</header>
```

### 6b. "New artist pack" section

Container:

```tsx
<section
  className="overflow-hidden rounded-xl border"
  style={{ backgroundColor: 'var(--lp-surface)', borderColor: 'var(--lp-border)' }}
>
  <div
    className="border-b px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary"
    style={{ borderColor: 'var(--lp-border)' }}
  >
    New artist pack
  </div>
  <NewPackForm artists={artists ?? []} />
</section>
```

### 6c. "Packs" list

Same container pattern as 6b. Replace the empty-state `bg-white`/`text-neutral-500` with tokens. Each `<li>` / `<Link>`:

```tsx
<Link
  href={`/rider-packs/${p.id}`}
  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-lp-surface-hover"
>
  <div className="min-w-0">
    <div className="truncate text-sm font-semibold text-lp-text">
      {p.title || '(untitled)'}
    </div>
    <div className="truncate text-xs text-lp-text-secondary">
      {artistMap.get(p.artist_id) ?? 'Unknown artist'}
      {' · '}
      <span className="uppercase tracking-wide">{p.scope}</span>
    </div>
  </div>
  <div className="text-[10px] text-lp-text-tertiary">
    {new Date(p.updated_at).toLocaleString()}
  </div>
</Link>
```

Divider between list items should use `style={{ borderColor: 'var(--lp-border)' }}` not `divide-lp-border` (because `divide-lp-*` may not be registered — safer to use border-top on each non-first item or inline style).

---

## Step 7 — Polish ExportPanel (inside PackEditor.tsx)

Find the `ExportPanel` component (currently ~lines 671–703 per pre-flight).

### 7a. Status pill

At the top of the panel, show an export status pill:

- If `pack.google_doc_url` is falsy → pill: "Not exported", colour `var(--lp-text-tertiary)`.
- If truthy → pill: "Exported", colour `var(--lp-orange)`.

Pill markup (matches BugReport pattern):

```tsx
<span
  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
  style={{
    backgroundColor: (pack.google_doc_url ? 'var(--lp-orange)' : 'var(--lp-text-tertiary)') + '1a',
    color: pack.google_doc_url ? 'var(--lp-orange)' : 'var(--lp-text-tertiary)',
    border: '1px solid ' + (pack.google_doc_url ? 'var(--lp-orange)' : 'var(--lp-text-tertiary)') + '33',
  }}
>
  {pack.google_doc_url ? 'Exported' : 'Not exported'}
</span>
```

Note: the colour-plus-alpha suffix syntax (`'1a'` for ~10% opacity, `'33'` for ~20%) only works with hex values. Since our tokens are CSS variables, use a separate approach — set a CSS custom property on the element:

Actually, simpler: just use two static hex colours that match the tokens. `var(--lp-orange)` is `#e87722` (check `src/app/globals.css` to confirm the hex; if different, use the actual value from globals).

STOP and ask if `--lp-orange` hex cannot be confirmed.

### 7b. Error alert

When the export fails, render an error box above the button:

```tsx
{error && (
  <div
    className="rounded-md border px-3 py-2 text-xs"
    style={{
      backgroundColor: 'var(--lp-orange)' + '1a',
      borderColor: 'var(--lp-orange)',
      color: 'var(--lp-text)',
    }}
  >
    <div className="font-semibold" style={{ color: 'var(--lp-orange)' }}>Export failed</div>
    <div className="mt-0.5 text-lp-text-secondary">{error}</div>
  </div>
)}
```

Same caveat about hex vs CSS-variable-plus-alpha: use the real hex from globals.

### 7c. Primary button

```tsx
<button
  onClick={handleExport}
  disabled={busy}
  className="rounded bg-[var(--lp-orange)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
>
  {busy ? 'Exporting…' : pack.google_doc_url ? 'Re-export to Google Doc' : 'Export to Google Doc'}
</button>
```

### 7d. Link to existing doc

If `pack.google_doc_url` is set, render a secondary link underneath:

```tsx
<a
  href={pack.google_doc_url}
  target="_blank"
  rel="noopener noreferrer"
  className="text-xs underline"
  style={{ color: 'var(--lp-text-secondary)' }}
>
  Open in Google Docs ↗
</a>
```

---

## Step 8 — Polish SharingPanel (inside PackEditor.tsx)

Find the `SharingPanel` component (currently ~lines 547–668 per pre-flight).

Changes (visual only — do not alter the share-link creation / revoke / password API calls):

### 8a. Each share-link row as a card

Wrap each row in:

```tsx
<div
  className="rounded-lg border p-3"
  style={{ backgroundColor: 'var(--lp-bg-secondary)', borderColor: 'var(--lp-border)' }}
>
```

### 8b. Mode badges

Show small pill badges for "Open" (no password) vs "Password-protected". Use the same pill pattern as Step 7a. Open = `var(--lp-orange)`; Password = use a neutral token (whatever the tertiary colour is — fall back to a static hex from globals.css if needed).

### 8c. Copy-link feedback

The copy button currently copies to clipboard with no feedback. Add a 1.5s "Copied!" state:

```ts
const [copied, setCopied] = useState(false);
const handleCopy = async (url: string) => {
  await navigator.clipboard.writeText(url);
  setCopied(true);
  setTimeout(() => setCopied(false), 1500);
};
```

Button label swaps `Copy link` ↔ `Copied!`.

### 8d. Empty state

When there are no share links:

```tsx
<div className="px-4 py-6 text-center text-sm text-lp-text-secondary">
  No share links yet. Create one above.
</div>
```

---

## Step 9 — Sidebar label update

`src/components/layout/Sidebar.tsx`: change the label on the `rider_packs` NavItem from `'Rider / Pack'` to `'Rider Packs'`. No other changes.

---

## Step 10 — Verification

```
grep -cE "neutral-[0-9]+|bg-white\b|bg-gray-[0-9]+|text-gray-[0-9]+|border-gray-[0-9]+" src/components/rider-pack/PackEditor.tsx src/components/rider-pack/FieldEditors.tsx src/components/rider-pack/AssetPicker.tsx 'src/app/(app)/rider-packs/page.tsx' 'src/app/(app)/rider-packs/[id]/page.tsx'
```

Target: **0** across all five files. Report the number.

```
grep -n "window.prompt\|^\s*prompt(" src/components/rider-pack/PackEditor.tsx
```

Target: **no matches**.

Then:

```
npx tsc --noEmit
npx eslint src/components/rider-pack/ src/app/\(app\)/rider-packs/ src/app/api/rider-packs/ src/lib/google/auth.ts src/components/layout/Sidebar.tsx
npx next build
```

All three must pass clean. Report the final 10 lines of `next build`.

### Manual sanity checks (not automated, but required before you commit)

1. `/rider-packs` loads, matches dark-mode design tokens, header reads "Rider Packs".
2. Click a pack → editor loads, all field cards use lp-* tokens (no white-on-white boxes).
3. Click "New section" → in-app modal appears (not browser prompt). Create a section. Cancel button works. Esc works.
4. TextEditor textarea: type three paragraphs. Verify it auto-grows and focus shows orange ring.
5. ExportPanel shows correct status pill. Click export.
   - If env vars are fine → export succeeds, pill flips to "Exported", Open link appears.
   - If env vars are missing/malformed → red error box with the specific message (e.g. "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY does not look like a PEM key").
6. Sidebar entry reads "Rider Packs".

---

## Final report format

Echo back exactly the following sections:

**Step 0 — Pre-flight output (A–E):** (paste outputs — include the debt count for D and line numbers for E)

**Step 10 — Verification output:**
- Final neutral-token debt count (must be 0)
- Final `window.prompt` match count (must be 0)
- `tsc --noEmit` exit code
- `eslint` exit code + warnings/errors count
- `next build` last 10 lines

**`git status -u --short`:** (paste)

**Any deviation from this prompt:** (if any — e.g. if a token name in globals.css was different, if you had to STOP and ask on something, if a file had extra neutral-* tokens beyond the mapping table)

**Final commit SHA:** (after you commit)

**Anything stopped on:** (or "nothing")

---

## Commit message

```
feat(rider-pack): polish editor + fix Google Doc export 500 (R7)

Editor UI polish
- Replace all neutral-* tokens with lp-* design tokens across PackEditor,
  FieldEditors, AssetPicker, /rider-packs index.
- Upgrade TextEditor: 200px min-height, auto-grow, orange focus ring.
- Replace native window.prompt() section creation with in-app modal
  (new NewSectionDialog component).
- Polish ExportPanel: status pill, error alert box, consistent buttons.
- Polish SharingPanel: card rows, mode badges, copy feedback.
- Rebrand 'Rider / Pack' → 'Rider Packs' in sidebar, index page, breadcrumb.

Export 500 fix
- Wrap entire export handler in try/catch so env-var and resolve failures
  surface as JSON errors instead of framework 500s.
- New GoogleAuthConfigError class with specific messages (missing env var,
  malformed private key). Returned with code GOOGLE_AUTH_CONFIG.
- Surface error message in ExportPanel UI.

No dependency or schema changes. No API contract changes (added optional
`code` field to error responses, success shape unchanged).
```
