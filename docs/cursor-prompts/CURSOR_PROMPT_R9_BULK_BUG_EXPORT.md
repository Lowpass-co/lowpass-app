# Cursor Prompt — R9: Bulk bug-report export (folder + ZIP)

Paste this whole file into Cursor. Execute in order. Do not skip steps. Do not add scope beyond what is listed. If a step is ambiguous, STOP and ask rather than guessing.

---

## Context

The bug report page (`src/components/bug-report/BugReportsClient.tsx`) already has single-bug export: `buildRepairPrompt(report)` generates a Markdown brief, and `copyScreenshotToClipboard(url)` puts the PNG on the clipboard. That works for one bug at a time.

This PR adds a **one-click bulk export for the top 10 most critical bugs**. Output is a bundle of:

- `prompt.md` — a single combined Cursor-ready brief covering all 10 bugs, with instructions to tackle them **one at a time with a commit between each**.
- `screenshots/01-<slug>.png` through `10-<slug>.png` — each bug's PNG, if present.

Delivery is dual-mode:

1. **Folder mode (Chrome/Edge/Opera/Arc/Brave — any Chromium).** Uses `window.showDirectoryPicker()`. User picks a destination folder once; files are written directly. No ZIP, no unpack step.
2. **ZIP mode fallback (Firefox/Safari or any browser that doesn't expose the File System Access API).** Builds the same bundle as a ZIP and triggers a download via `<a download>`. Uses `jszip`, dynamically imported so Chromium users never pay the KB cost.

Feature detection is `typeof window !== 'undefined' && 'showDirectoryPicker' in window`. If folder mode throws `AbortError` (user cancelled), do NOT fall back to ZIP — they chose to cancel. Only fall back to ZIP if the API is absent or throws a non-abort error (e.g. not a secure context).

**Selection logic** (user decision): top 10 by severity rank, then recency. Rank order is `critical > high > medium > low`. Always returns up to 10; returns fewer only if the database has fewer. Status is ignored (resolved and open bugs both eligible).

Admin-only — the existing `/api/bug-reports` GET is already gated by `isAdmin`, and this feature reuses that endpoint. No new API route is needed.

---

## Hard rules

1. **One new dependency only: `jszip`.** Pin to a recent stable (whatever is current at install time). Do not add anything else — no `file-saver`, no `browser-fs-access`, no compat shims. Use dynamic `import()` so the dep is only loaded in the ZIP fallback path.
2. **No schema changes. No new API routes. No migrations.**
3. **No changes to signed URL TTL.** The existing 1-hour TTL is plenty for an export operation that fetches all 10 images in seconds.
4. **Strict TypeScript.** Zero `any`, no `@ts-ignore`. Use the File System Access API types that ship with TypeScript 5.4+. If the project's TS version is older, tell me before writing fallback typings.
5. **Scoped file list below is authoritative.** Do not touch files outside it.
6. **Reuse existing helpers.** Do not re-implement `buildRepairPrompt`, `copyToClipboard`, or `toPngBlob` — extract and reuse them.
7. **Design tokens only.** Buttons use the existing Lowpass patterns. No raw `#hex`, no `neutral-*`, no `bg-white`.

---

## File list

**Edit (3):**

- `src/components/bug-report/BugReportsClient.tsx`
- `package.json`
- `package-lock.json` (auto — from `npm install`)

**New (1):**

- `src/components/bug-report/bulk-export.ts`

---

## Step 0 — Pre-flight output (A–E)

### A. Last commit on `main`

```
git log --oneline -1
```

### B. TypeScript version supports File System Access API types natively

```
cat package.json | grep '"typescript"'
```

Must be `5.4.x` or higher. If older, STOP and report — we'd need to add `@types/wicg-file-system-access` and I want to approve that first.

### C. Existing helpers and route still exist

```
grep -n "function buildRepairPrompt" src/components/bug-report/BugReportsClient.tsx
grep -n "async function toPngBlob" src/components/bug-report/BugReportsClient.tsx
grep -n "SEVERITY_ORDER" src/components/bug-report/types.ts
ls src/app/api/bug-reports/route.ts
```

All four must return a hit.

### D. `jszip` not already installed

```
grep -n "jszip" package.json || echo "jszip not installed (expected)"
```

### E. Header action location in BugReportsClient.tsx

```
grep -n "RefreshCw\|onClick={refresh}\|handleRefresh" src/components/bug-report/BugReportsClient.tsx | head -5
```

Report line numbers. The new export button will go adjacent to the refresh button. If the refresh button lives somewhere unexpected (not in the top header strip), STOP and ask before placing the export button.

---

## Step 1 — Install `jszip`

```
npm install jszip
```

This writes to `package.json` and `package-lock.json`. No `--save-dev`; it's a runtime dep.

Verify:

```
grep -n "jszip" package.json
```

Must now show a match under `"dependencies"`.

---

## Step 2 — Create `src/components/bug-report/bulk-export.ts`

New file. Pure logic — no JSX. Exports four things the client component will use: `selectTopCritical`, `buildBulkRepairPrompt`, `exportBundleToFolder`, `exportBundleToZip`, plus an `isDirectoryPickerSupported` feature-detect helper.

```ts
/* ============================================
   LOWPASS — Bulk bug export helpers

   Two delivery modes: File System Access API
   (Chromium) writes directly into a user-picked
   folder; a ZIP download is the fallback for
   Firefox/Safari.

   Both modes produce the same bundle:
     prompt.md
     screenshots/01-<slug>.png
     screenshots/02-<slug>.png
     ...
   ============================================ */

import {
  SEVERITY_META,
  SEVERITY_ORDER,
  type BugReport,
} from './types';

export type BulkBundle = {
  promptMarkdown: string;
  screenshots: Array<{ filename: string; blob: Blob }>;
  missingScreenshotCount: number;
};

export type ExportProgress = {
  stage: 'fetching' | 'writing' | 'done';
  current: number;
  total: number;
};

/**
 * Returns up to `count` reports, ranked critical > high > medium > low,
 * then by created_at DESC. Status is ignored.
 */
export function selectTopCritical(reports: BugReport[], count = 10): BugReport[] {
  // SEVERITY_ORDER is ['critical', 'high', 'medium', 'low'] — low index = more severe.
  return [...reports]
    .sort((a, b) => {
      const rankDiff =
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
      if (rankDiff !== 0) return rankDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, count);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'untitled';
}

function padIndex(i: number): string {
  return String(i + 1).padStart(2, '0');
}

/**
 * Compose one Markdown brief covering all selected bugs. The agent is
 * instructed to tackle them ONE AT A TIME and commit between each —
 * batched fixes reliably produce half-done work.
 */
export function buildBulkRepairPrompt(reports: BugReport[]): string {
  const lines: string[] = [];

  lines.push(
    `You are triaging and fixing ${reports.length} bug reports from the Lowpass tour-management app.`,
    '',
    '## How to work through this',
    '',
    '1. Pick bug #1. Read its section below.',
    '2. Locate the root cause in the codebase.',
    '3. Propose the smallest possible fix. Ask before touching anything outside that surface area.',
    '4. Implement, verify with `npx tsc --noEmit` and `npx next build`.',
    '5. Commit with a message of the form `fix(scope): short description (bug #N)`.',
    '6. Move to bug #2. Repeat.',
    '',
    'Do NOT batch fixes into one commit. Do NOT attempt all 10 in parallel. One bug, one commit, one verification pass — every time.',
    'If a bug looks like it overlaps with another, surface that before starting work on either.',
    '',
    '---',
    '',
  );

  reports.forEach((r, i) => {
    const num = padIndex(i);
    const slug = slugify(r.title || r.description.split('\n')[0] || `bug-${r.id.slice(0, 8)}`);
    const summary = r.title?.trim() || r.description.split('\n')[0].slice(0, 200);
    const viewport =
      r.viewport_width && r.viewport_height
        ? `${r.viewport_width}×${r.viewport_height}`
        : '(unknown)';
    const reporter = r.reporter?.name || r.reporter?.email || '(unknown)';
    const screenshot = r.screenshot_url
      ? `\`screenshots/${num}-${slug}.png\` in the bundle folder/ZIP.`
      : '(no screenshot attached)';

    lines.push(
      `## Bug #${num} — ${summary}`,
      '',
      `- **Severity:** ${SEVERITY_META[r.severity].label} (${r.severity})`,
      `- **Status:** ${r.status}`,
      `- **Reporter:** ${reporter}`,
      `- **Page URL:** ${r.page_url ?? '(unknown)'}`,
      `- **Path:** ${r.page_path ?? '(unknown)'}`,
      `- **Browser / OS / Viewport:** ${r.browser ?? '?'} / ${r.os ?? '?'} / ${viewport}`,
      `- **Screenshot:** ${screenshot}`,
      `- **Bug ID:** \`${r.id}\``,
      '',
      '### What happened',
      r.description.trim() || '(no description)',
      '',
      '### Steps to reproduce',
      r.steps_to_reproduce?.trim() || '(not provided)',
      '',
      '---',
      '',
    );
  });

  lines.push(
    '## Final report format',
    '',
    'After each commit, report:',
    '- Bug number + one-line summary',
    '- Files changed',
    '- Commit SHA',
    '- Any deviation (e.g. if the fix required touching something unexpected)',
    '',
    'After all bugs, summarize which were fixed, which were deferred (and why), and whether any revealed a systemic issue worth a separate refactor.',
    '',
  );

  return lines.join('\n');
}

/**
 * Re-encode any image blob to PNG. File System Access API can accept
 * any blob, but we normalise to PNG for consistency with the ZIP path
 * and because the existing single-copy button already does this.
 */
async function toPngBlob(source: Blob): Promise<Blob> {
  if (source.type === 'image/png') return source;
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('png encode failed'))),
      'image/png',
    );
  });
}

/**
 * Fetch all screenshots for the selected reports. Missing or failing
 * fetches are skipped (the prompt already marks those as "no screenshot
 * attached"). Progress callback is optional — the caller uses it to
 * drive a spinner/counter.
 */
export async function buildBundle(
  reports: BugReport[],
  onProgress?: (p: ExportProgress) => void,
): Promise<BulkBundle> {
  const screenshots: BulkBundle['screenshots'] = [];
  let missing = 0;

  for (let i = 0; i < reports.length; i++) {
    onProgress?.({ stage: 'fetching', current: i, total: reports.length });
    const r = reports[i];
    if (!r.screenshot_url) {
      missing += 1;
      continue;
    }
    try {
      const res = await fetch(r.screenshot_url, { credentials: 'omit' });
      if (!res.ok) {
        missing += 1;
        continue;
      }
      const png = await toPngBlob(await res.blob());
      const slug = slugify(r.title || r.description.split('\n')[0] || `bug-${r.id.slice(0, 8)}`);
      screenshots.push({
        filename: `${padIndex(i)}-${slug}.png`,
        blob: png,
      });
    } catch {
      missing += 1;
    }
  }

  onProgress?.({ stage: 'fetching', current: reports.length, total: reports.length });

  return {
    promptMarkdown: buildBulkRepairPrompt(reports),
    screenshots,
    missingScreenshotCount: missing,
  };
}

export function isDirectoryPickerSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Folder mode. Throws `AbortError` if the user cancels the directory
 * picker. Throws other errors (e.g. "not a secure context") for the
 * caller to decide whether to fall back to ZIP.
 */
export async function exportBundleToFolder(
  bundle: BulkBundle,
  onProgress?: (p: ExportProgress) => void,
): Promise<void> {
  // showDirectoryPicker is a 2023+ API; TypeScript 5.4+ ships lib types for it.
  const dirHandle = await (window as unknown as {
    showDirectoryPicker: (opts?: {
      mode?: 'read' | 'readwrite';
      startIn?: 'documents' | 'desktop' | 'downloads';
    }) => Promise<FileSystemDirectoryHandle>;
  }).showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });

  // Write prompt.md.
  const promptHandle = await dirHandle.getFileHandle('prompt.md', { create: true });
  const promptWriter = await promptHandle.createWritable();
  await promptWriter.write(bundle.promptMarkdown);
  await promptWriter.close();

  // Write each screenshot into a "screenshots" subdir.
  if (bundle.screenshots.length > 0) {
    const shotsHandle = await dirHandle.getDirectoryHandle('screenshots', { create: true });
    for (let i = 0; i < bundle.screenshots.length; i++) {
      onProgress?.({ stage: 'writing', current: i, total: bundle.screenshots.length });
      const { filename, blob } = bundle.screenshots[i];
      const fh = await shotsHandle.getFileHandle(filename, { create: true });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
    }
  }

  onProgress?.({ stage: 'done', current: bundle.screenshots.length, total: bundle.screenshots.length });
}

/**
 * ZIP fallback. Dynamic import of jszip so Chromium users never
 * download it. Triggers a single <a download> click.
 */
export async function exportBundleToZip(
  bundle: BulkBundle,
  onProgress?: (p: ExportProgress) => void,
): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('prompt.md', bundle.promptMarkdown);

  if (bundle.screenshots.length > 0) {
    const folder = zip.folder('screenshots');
    if (!folder) throw new Error('failed to create screenshots folder in zip');
    for (let i = 0; i < bundle.screenshots.length; i++) {
      onProgress?.({ stage: 'writing', current: i, total: bundle.screenshots.length });
      const { filename, blob } = bundle.screenshots[i];
      folder.file(filename, blob);
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const timestamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lowpass-bugs-${timestamp}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  onProgress?.({ stage: 'done', current: bundle.screenshots.length, total: bundle.screenshots.length });
}
```

**Type-check note:** `FileSystemDirectoryHandle` is a lib DOM type in TypeScript 5.4+. If `tsc` complains that it's not defined, STOP and tell me — I'll approve adding `@types/wicg-file-system-access`.

---

## Step 3 — Wire the button into `BugReportsClient.tsx`

Three small changes.

### 3a. Import from the new module

Near the other local imports (around line 26–36):

```tsx
import {
  buildBundle,
  exportBundleToFolder,
  exportBundleToZip,
  isDirectoryPickerSupported,
  selectTopCritical,
  type ExportProgress,
} from './bulk-export';
import { FolderDown } from 'lucide-react';
```

Add `FolderDown` to the existing `lucide-react` import line (alphabetical position — near `Eye` / `EyeOff`) rather than making a second import block. If `FolderDown` isn't exported by the installed `lucide-react` version, use `Download` instead — report which one you used.

### 3b. Add export state inside the `BugReportsClient` component

Near the other `useState` calls in the component:

```tsx
const [exporting, setExporting] = useState(false);
const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
const [exportError, setExportError] = useState<string | null>(null);
```

Define the handler:

```tsx
const handleBulkExport = useCallback(async () => {
  if (exporting) return;
  setExporting(true);
  setExportError(null);
  setExportProgress({ stage: 'fetching', current: 0, total: 10 });

  try {
    const top = selectTopCritical(reports, 10);
    if (top.length === 0) {
      setExportError('No bugs to export.');
      return;
    }

    const bundle = await buildBundle(top, setExportProgress);

    if (isDirectoryPickerSupported()) {
      try {
        await exportBundleToFolder(bundle, setExportProgress);
      } catch (err) {
        // User cancelled the picker — silent bail.
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        // Non-abort error: fall through to ZIP.
        console.warn('[bulk-export] folder mode failed, falling back to zip', err);
        await exportBundleToZip(bundle, setExportProgress);
      }
    } else {
      await exportBundleToZip(bundle, setExportProgress);
    }
  } catch (err) {
    setExportError(err instanceof Error ? err.message : 'Export failed');
  } finally {
    setExporting(false);
    setExportProgress(null);
  }
}, [exporting, reports]);
```

Replace `reports` with whatever the actual state variable is in this component (per pre-flight, you'll have seen it). Don't guess.

### 3c. Render the button next to the existing Refresh button

Place it immediately to the LEFT of the Refresh button. Match the existing button styling — the refresh button is your reference for height, padding, and icon sizing.

Template:

```tsx
<button
  type="button"
  onClick={handleBulkExport}
  disabled={exporting || reports.length === 0}
  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
  style={{
    backgroundColor: 'var(--lp-surface)',
    border: '1px solid var(--lp-border)',
    color: 'var(--lp-text)',
  }}
  title={
    isDirectoryPickerSupported()
      ? 'Export top 10 critical bugs into a folder you pick'
      : 'Export top 10 critical bugs as a ZIP download'
  }
>
  {exporting ? (
    <Loader2 className="h-3.5 w-3.5 animate-spin" />
  ) : (
    <FolderDown className="h-3.5 w-3.5" />
  )}
  {exporting
    ? exportProgress
      ? `${exportProgress.stage === 'fetching' ? 'Fetching' : 'Writing'} ${exportProgress.current}/${exportProgress.total}`
      : 'Exporting…'
    : 'Export top 10'}
</button>
```

If `reports` is named differently (e.g. `allReports`, `bugs`, `data`), swap it. Button must live in the same flex/grid container as the Refresh button — do not create a new header row.

### 3d. Render the error state

Below the button row, or wherever existing errors render, add:

```tsx
{exportError && (
  <div
    className="rounded-md border px-3 py-2 text-xs"
    style={{
      backgroundColor: '#EF44441a',
      borderColor: '#EF4444',
      color: 'var(--lp-text)',
    }}
  >
    <div className="font-semibold" style={{ color: '#EF4444' }}>
      Export failed
    </div>
    <div className="mt-0.5" style={{ color: 'var(--lp-text-secondary)' }}>
      {exportError}
    </div>
  </div>
)}
```

The `#EF4444` hex is the value of `--color-lp-error` in `src/app/globals.css`. Confirm that hex before committing — if it's different, use the actual hex from globals.

---

## Step 4 — Verification

```
npx tsc --noEmit
npx eslint src/components/bug-report/
npx next build
```

All three must pass clean. Report the final 10 lines of `next build`.

### Manual sanity checks (required before commit)

1. **Chrome (or Cursor's Electron window):** click the button. A native folder picker appears. Pick a folder. Watch the button progress counter tick through `Fetching 1/10 … 10/10` then `Writing 1/N … done`. Navigate to the chosen folder in Finder — you should see `prompt.md` and a `screenshots/` subfolder with up to 10 PNGs.
2. **Same browser, second run:** click again, pick the same folder. Files should overwrite cleanly (no errors). The timestamp on `prompt.md` advances.
3. **Click the picker, then cancel.** Nothing should download, no ZIP, no error. The button returns to its idle state.
4. **Safari or Firefox (if you have one available):** click the button. No picker appears — a ZIP download triggers automatically. The ZIP, once extracted, has the same structure as the folder mode.
5. **With zero bugs in the DB:** button is disabled and shows `disabled:opacity-50`.
6. **Open `prompt.md`:** it names the bugs `#01`, `#02`, etc. in severity order. The instruction "one bug, one commit" is at the top.

---

## Final report format

Echo back exactly the following sections:

**Step 0 — Pre-flight output (A–E):** (paste outputs)

**Step 4 — Verification output:**
- `tsc --noEmit` exit code
- `eslint` exit code + warnings/errors count
- `next build` last 10 lines

**Folder-mode test result:** what you saw when you clicked the button in Chromium, including the counter progression and the resulting folder contents.

**Which lucide icon you used:** `FolderDown` or `Download` (or something else you STOPPED to ask about).

**Confirmed `--color-lp-error` hex:** paste the value from `globals.css` and confirm it matches the `#EF4444` used in the error alert.

**`git status -u --short`:** (paste)

**Any deviation from this prompt:** (if any — e.g. icon fallback, state variable renaming, TS types for showDirectoryPicker)

**Final commit SHA:** (after you commit)

**Anything stopped on:** (or "nothing")

---

## Commit message

```
feat(bug-reports): bulk export top 10 critical bugs (R9)

One-click export bundles the top 10 most critical open bugs into a
Cursor-ready package:
- prompt.md — combined Markdown brief instructing the agent to fix
  each bug sequentially with a commit between each (batching 10 fixes
  into one prompt reliably produces half-done work).
- screenshots/NN-<slug>.png — one PNG per bug with a screenshot.

Dual delivery:
- Folder mode (Chromium): window.showDirectoryPicker() writes directly
  into the folder the user picks. No ZIP, no unpack step.
- ZIP mode (Firefox/Safari): jszip generates a timestamped .zip file
  via <a download>. jszip is dynamic-imported so Chromium users don't
  pay the KB cost.

Selection: top 10 by severity rank (critical > high > medium > low)
then created_at DESC. Always returns up to 10; status ignored.

No schema changes. No new API routes. Admin-only via existing
/api/bug-reports gate.
```
