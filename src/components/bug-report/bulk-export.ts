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

/**
 * Subset of the File System Access API used here. The bundled `lib.dom`
 * for this repo does not declare `showDirectoryPicker` / handles yet.
 */
type FileSystemWritableFileStreamLike = {
  write(data: string | Blob): Promise<void>;
  close(): Promise<void>;
};

type FileSystemFileHandleLike = {
  createWritable(): Promise<FileSystemWritableFileStreamLike>;
};

type FileSystemDirectoryHandleLike = {
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemFileHandleLike>;
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemDirectoryHandleLike>;
};

type WindowWithDirectoryPicker = Window & {
  showDirectoryPicker: (options?: {
    mode?: 'read' | 'readwrite';
    startIn?: 'documents' | 'desktop' | 'downloads';
  }) => Promise<FileSystemDirectoryHandleLike>;
};

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
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'untitled'
  );
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
    const slug = slugify(
      r.title || r.description.split('\n')[0] || `bug-${r.id.slice(0, 8)}`,
    );
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
export async function toPngBlob(source: Blob): Promise<Blob> {
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
    onProgress?.({
      stage: 'fetching',
      current: i + 1,
      total: reports.length,
    });
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
      const slug = slugify(
        r.title || r.description.split('\n')[0] || `bug-${r.id.slice(0, 8)}`,
      );
      screenshots.push({
        filename: `${padIndex(i)}-${slug}.png`,
        blob: png,
      });
    } catch {
      missing += 1;
    }
  }

  onProgress?.({
    stage: 'fetching',
    current: reports.length,
    total: reports.length,
  });

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
  const dirHandle = await (window as unknown as WindowWithDirectoryPicker).showDirectoryPicker({
    mode: 'readwrite',
    startIn: 'documents',
  });

  const promptHandle = await dirHandle.getFileHandle('prompt.md', { create: true });
  const promptWriter = await promptHandle.createWritable();
  await promptWriter.write(bundle.promptMarkdown);
  await promptWriter.close();

  if (bundle.screenshots.length > 0) {
    const shotsHandle = await dirHandle.getDirectoryHandle('screenshots', {
      create: true,
    });
    for (let i = 0; i < bundle.screenshots.length; i++) {
      onProgress?.({
        stage: 'writing',
        current: i + 1,
        total: bundle.screenshots.length,
      });
      const { filename, blob } = bundle.screenshots[i];
      const fh = await shotsHandle.getFileHandle(filename, { create: true });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
    }
  }

  onProgress?.({
    stage: 'done',
    current: bundle.screenshots.length,
    total: bundle.screenshots.length,
  });
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
      onProgress?.({
        stage: 'writing',
        current: i + 1,
        total: bundle.screenshots.length,
      });
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

  onProgress?.({
    stage: 'done',
    current: bundle.screenshots.length,
    total: bundle.screenshots.length,
  });
}
