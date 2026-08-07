'use client';

/* ============================================================
   LOWPASS — <FilesCanvas> (Files v2 — Drive-style folder canvas)

   Replaces <TourFilesClient>'s flat DataTable on BOTH Files surfaces
   (Operations → Files and the artist-library Files page) with a
   Google-Drive-style canvas: folder tiles first, then file cards, a
   breadcrumb toolbar, per-item ⋯ menus (Rename / Move to… / Download /
   Delete), and HTML5 drag-and-drop (drag a file card onto a folder tile
   to move it — same dataTransfer pattern as <AdvanceSectionLibrary>).

   Folder model (zero-migration): a folder is just metadata.folder on a
   file_references row — a '/'-joined path string ("Contracts/2026").
   A folder EXISTS if any file carries it (or a prefix of it) OR it's in
   this session's just-created set. Empty folders are session-local until
   a file lands in them; folder rename PATCHes every file under the
   prefix; folder delete is only enabled when empty.

   Read side: `initial` FileVm rows come from the server pages exactly as
   before; folder assignments hydrate from GET /api/files (metadata isn't
   on FileVm). Write side: the EXACT existing POST /api/files upload flow,
   plus a `folder` field targeting the current folder; PATCH /api/files
   for rename/move; DELETE for delete. Mutations update local state
   optimistically — no refetch — matching the old client's no-reload
   prepend. Rows that aren't file_references-backed (rider-pack /
   advance / personnel assets) render at Home and are download-only.

   Click a file card → the existing <FileSlideOver> (preview + the
   current signed-url download path). ⋯ → Download signs a URL client-side
   against the row's storage bucket/path.
   ============================================================ */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  ChevronRight,
  Download,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FileVm } from '@/lib/tour-files/types';
import { useToast } from '@/components/ui/Toast';
import { PageTitle } from '@/components/ui/PageHeader';
import { createClient } from '@/lib/supabase-client';

const FileSlideOver = dynamic(() => import('@/components/entity/file/FileSlideOver'), { ssr: false });

/** dataTransfer key for internal file-card drags (kept lowercase — browsers
    normalise type strings). Same mechanism as SECTION_LIBRARY_DRAG_TYPE. */
const FILE_DRAG_TYPE = 'application/x-lowpass-file';

function fmtSize(n: number | null): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function rel(iso: string): string {
  try {
    const d = new Date(iso);
    const delta = Date.now() - d.getTime();
    const mins = Math.floor(delta / 60000);
    if (mins < 120) return `${mins}m ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

/** file_references-backed rows carry the `ref:` id prefix (see /api/files
    POST). Only those can be renamed / moved / deleted here. */
function refIdOf(row: FileVm): string | null {
  return row.id.startsWith('ref:') ? row.id.slice('ref:'.length) : null;
}

function iconForFile(name: string, mime: string | null): LucideIcon {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  if (mime?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic'].includes(ext)) return FileImage;
  if (mime?.startsWith('video/') || ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext)) return FileVideo;
  if (mime?.startsWith('audio/') || ['mp3', 'wav', 'aiff', 'flac', 'm4a', 'ogg'].includes(ext)) return FileAudio;
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(ext)) return FileSpreadsheet;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return FileArchive;
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'pages'].includes(ext)) return FileText;
  return FileIcon;
}

/** One folder-name segment: trimmed, '/' is the path separator so it can't
    appear inside a name. Empty after cleaning → null (caller cancels). */
function cleanSegment(raw: string): string | null {
  const name = raw.replace(/\//g, '-').trim().slice(0, 100);
  return name || null;
}

type MenuState =
  | { kind: 'file'; rowId: string; mode: 'menu' | 'move' }
  | { kind: 'folder'; path: string }
  | null;

type RenamingState =
  | { kind: 'file'; rowId: string; value: string }
  | { kind: 'folder'; path: string; value: string }
  | null;

export interface FilesCanvasProps {
  initial: FileVm[];
  /** What an uploaded file links to. Defaults to tour scope for back-compat. */
  uploadScope?: { type: 'tour' | 'artist'; id: string };
  title?: string;
  subtitle?: string;
}

export function FilesCanvas({ initial, uploadScope, title = 'Files', subtitle }: FilesCanvasProps) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<FileVm[]>(initial);
  /** FileVm.id → folder path (''/absent = Home). Hydrated from GET /api/files. */
  const [folderOf, setFolderOf] = useState<Record<string, string>>({});
  /** Folders created this session that may not have a file yet. Full paths. */
  const [createdFolders, setCreatedFolders] = useState<string[]>([]);
  /** Current folder path ('' = Home). */
  const [path, setPath] = useState('');
  const [selected, setSelected] = useState<FileVm | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [draggingFileId, setDraggingFileId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [renaming, setRenaming] = useState<RenamingState>(null);
  const [newFolderDraft, setNewFolderDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const canUpload = !!uploadScope;
  const scopeType = uploadScope?.type;
  const scopeId = uploadScope?.id;

  /* ---- hydrate folder assignments (metadata.folder isn't on FileVm) ---- */
  useEffect(() => {
    if (!scopeType || !scopeId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/files?linked_to_type=${encodeURIComponent(scopeType)}&linked_to_id=${encodeURIComponent(scopeId)}`,
        );
        const json = (await res.json().catch(() => null)) as
          | { files?: { id: string; metadata?: { folder?: string | null } | null }[] }
          | null;
        if (cancelled || !res.ok || !json?.files) return;
        const map: Record<string, string> = {};
        for (const f of json.files) {
          const folder = f.metadata?.folder;
          if (typeof folder === 'string' && folder) map[`ref:${f.id}`] = folder;
        }
        setFolderOf(map); // async callback, not a render-phase set (hooks rule safe)
      } catch {
        /* hydration is best-effort — files simply stay at Home */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scopeType, scopeId]);

  /* ---- Esc closes any open ⋯ menu (keyboard contract §13) ---- */
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menu]);

  /* ---- derived folder tree ---- */
  const allFolderPaths = useMemo(() => {
    const set = new Set<string>();
    const addWithPrefixes = (p: string) => {
      const parts = p.split('/');
      for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('/'));
    };
    Object.values(folderOf).forEach(addWithPrefixes);
    createdFolders.forEach(addWithPrefixes);
    return set;
  }, [folderOf, createdFolders]);

  const sortedFolderPaths = useMemo(
    () => [...allFolderPaths].sort((a, b) => a.localeCompare(b)),
    [allFolderPaths],
  );

  const childFolders = useMemo(() => {
    const prefix = path ? `${path}/` : '';
    const names = new Set<string>();
    for (const p of allFolderPaths) {
      if (p === path) continue;
      if (prefix && !p.startsWith(prefix)) continue;
      const name = (prefix ? p.slice(prefix.length) : p).split('/')[0];
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [allFolderPaths, path]);

  const filesHere = useMemo(
    () => rows.filter((r) => (folderOf[r.id] ?? '') === path),
    [rows, folderOf, path],
  );

  const countUnder = useCallback(
    (full: string) =>
      rows.filter((r) => {
        const f = folderOf[r.id] ?? '';
        return f === full || f.startsWith(`${full}/`);
      }).length,
    [rows, folderOf],
  );

  /* ---- upload: the EXACT existing POST flow + folder into metadata ---- */
  const doUpload = useCallback(
    async (files: File[]) => {
      if (!uploadScope || files.length === 0) return;
      const folder = path; // uploads land in the folder that was open
      setUploading(true);
      for (const file of files) {
        try {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('linked_to_type', uploadScope.type);
          fd.append('linked_to_id', uploadScope.id);
          if (folder) fd.append('folder', folder);
          const res = await fetch('/api/files', { method: 'POST', body: fd });
          const json = (await res.json().catch(() => null)) as { file?: FileVm; error?: string } | null;
          if (!res.ok || !json?.file) {
            showToast(json?.error ?? `Could not upload ${file.name}`, 'error');
            continue;
          }
          const vm = json.file as FileVm;
          setRows((prev) => [vm, ...prev]); // no-reload optimistic prepend
          if (folder) setFolderOf((prev) => ({ ...prev, [vm.id]: folder }));
        } catch {
          showToast(`Could not upload ${file.name}`, 'error');
        }
      }
      setUploading(false);
    },
    [uploadScope, path, showToast],
  );

  const onCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length) void doUpload(files);
    },
    [doUpload],
  );

  /* ---- mutations (PATCH / DELETE; local-state refresh, no refetch) ---- */
  const patchFile = useCallback(
    async (refId: string, body: { file_name?: string; metadata?: { folder?: string | null } }): Promise<boolean> => {
      try {
        const res = await fetch('/api/files', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: refId, ...body }),
        });
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          showToast(json?.error ?? 'Could not update the file', 'error');
          return false;
        }
        return true;
      } catch {
        showToast('Could not update the file', 'error');
        return false;
      }
    },
    [showToast],
  );

  const moveFile = useCallback(
    async (row: FileVm, dest: string) => {
      const refId = refIdOf(row);
      if (!refId || (folderOf[row.id] ?? '') === dest) return;
      const ok = await patchFile(refId, { metadata: { folder: dest || null } });
      if (!ok) return;
      setFolderOf((prev) => {
        const next = { ...prev };
        if (dest) next[row.id] = dest;
        else delete next[row.id];
        return next;
      });
      showToast(`Moved “${row.filename}” to ${dest || 'Home'}`, 'success');
    },
    [folderOf, patchFile, showToast],
  );

  const deleteFile = useCallback(
    async (row: FileVm) => {
      const refId = refIdOf(row);
      if (!refId) return;
      if (!window.confirm(`Delete “${row.filename}”? This can't be undone.`)) return;
      try {
        const res = await fetch(`/api/files?refId=${encodeURIComponent(refId)}`, { method: 'DELETE' });
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          showToast(json?.error ?? `Could not delete ${row.filename}`, 'error');
          return;
        }
        setRows((prev) => prev.filter((r) => r.id !== row.id));
        setFolderOf((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
      } catch {
        showToast(`Could not delete ${row.filename}`, 'error');
      }
    },
    [showToast],
  );

  const downloadFile = useCallback(
    async (row: FileVm) => {
      try {
        if (row.externalUrl) {
          window.open(row.externalUrl, '_blank', 'noopener');
          return;
        }
        if (!row.storageBucket || !row.storagePath) {
          showToast('No stored copy to download', 'error');
          return;
        }
        // Same signed-url path the file panel uses: client-side Supabase
        // storage sign against the row's bucket + path.
        const supabase = createClient();
        const { data, error } = await supabase.storage
          .from(row.storageBucket)
          .createSignedUrl(row.storagePath, 60 * 10, { download: row.filename });
        if (error || !data?.signedUrl) {
          showToast(error?.message ?? 'Could not create a download link', 'error');
          return;
        }
        window.open(data.signedUrl, '_blank', 'noopener');
      } catch {
        showToast('Could not create a download link', 'error');
      }
    },
    [showToast],
  );

  /** Folder rename = PATCH every file_references row under the old prefix. */
  const renameFolderPath = useCallback(
    async (full: string, newName: string) => {
      const parent = full.includes('/') ? full.slice(0, full.lastIndexOf('/')) : '';
      const dest = parent ? `${parent}/${newName}` : newName;
      if (dest === full) return;
      const affected = rows.filter((r) => {
        const f = folderOf[r.id] ?? '';
        return refIdOf(r) !== null && (f === full || f.startsWith(`${full}/`));
      });
      setBusy(true);
      let failures = 0;
      for (const r of affected) {
        const from = folderOf[r.id] ?? '';
        const to = dest + from.slice(full.length);
        const ok = await patchFile(refIdOf(r) as string, { metadata: { folder: to } });
        if (ok) setFolderOf((prev) => ({ ...prev, [r.id]: to }));
        else failures += 1;
      }
      setCreatedFolders((prev) =>
        prev.map((p) => (p === full || p.startsWith(`${full}/`) ? dest + p.slice(full.length) : p)),
      );
      setPath((p) => (p === full || p.startsWith(`${full}/`) ? dest + p.slice(full.length) : p));
      setBusy(false);
      if (failures > 0) {
        showToast(`Could not move ${failures} file${failures === 1 ? '' : 's'} to “${dest}”`, 'error');
      }
    },
    [rows, folderOf, patchFile, showToast],
  );

  /** Folder delete — only reachable when empty (button is disabled otherwise),
      so it's purely removing the session-created path. */
  const deleteFolder = useCallback((full: string) => {
    setCreatedFolders((prev) => prev.filter((p) => p !== full));
    setMenu(null);
  }, []);

  const commitNewFolder = useCallback(() => {
    const name = newFolderDraft !== null ? cleanSegment(newFolderDraft) : null;
    setNewFolderDraft(null);
    if (!name) return;
    const full = path ? `${path}/${name}` : name;
    setCreatedFolders((prev) => (prev.includes(full) ? prev : [...prev, full]));
  }, [newFolderDraft, path]);

  const commitRename = useCallback(async () => {
    const r = renaming;
    setRenaming(null);
    if (!r) return;
    if (r.kind === 'file') {
      const row = rows.find((x) => x.id === r.rowId);
      const name = r.value.trim().slice(0, 255);
      if (!row || !name || name === row.filename) return;
      const refId = refIdOf(row);
      if (!refId) return;
      const ok = await patchFile(refId, { file_name: name });
      if (ok) setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, filename: name } : x)));
    } else {
      const name = cleanSegment(r.value);
      if (!name) return;
      await renameFolderPath(r.path, name);
    }
  }, [renaming, rows, patchFile, renameFolderPath]);

  /* ---- small render helpers ---- */
  const microLabel = (text: string) => (
    <div
      className="lp-label-caps"
      style={{
        fontSize: 'var(--lp-text-2xs)',
        fontWeight: 'var(--lp-weight-semibold)',
        letterSpacing: 'var(--lp-tracking-caps)',
        textTransform: 'uppercase',
        color: 'var(--lp-text-tertiary)',
      }}
    >
      {text}
    </div>
  );

  const menuItem = (opts: {
    label: string;
    icon: LucideIcon;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
    title?: string;
  }) => {
    const { label, icon: Icon, onClick, disabled, danger, title: hint } = opts;
    return (
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        title={hint}
        onClick={onClick}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--lp-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50 ${
          danger ? 'text-lp-error' : ''
        }`}
        style={danger ? undefined : { color: 'var(--lp-text)' }}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </button>
    );
  };

  /* Same popover grammar as <ProductHeaderAvatarMenu>: lp-surface, strong
     border, dropdown z-layer. */
  const popoverStyle: React.CSSProperties = {
    zIndex: 'var(--lp-z-dropdown)',
    background: 'var(--lp-surface)',
    borderColor: 'var(--lp-border-strong)',
    boxShadow: 'var(--lp-shadow-popover)',
  };

  const backdrop = (
    <div
      aria-hidden
      className="fixed inset-0"
      style={{ zIndex: 'var(--lp-z-overlay)', background: 'transparent' }}
      onMouseDown={() => setMenu(null)}
    />
  );

  const segments = path ? path.split('/') : [];
  const managedHint = 'Managed by its source surface (rider pack / advance / personnel)';
  const hasAnything = childFolders.length > 0 || filesHere.length > 0 || newFolderDraft !== null;
  const scopeNoun = uploadScope?.type ?? 'tour';

  return (
    <div
      className="mx-auto flex min-h-0 max-w-5xl flex-1 flex-col space-y-6 pb-12"
      onDragOver={(e) => {
        if (!canUpload) return;
        // Internal card drags carry FILE_DRAG_TYPE, not 'Files' — those are
        // handled by folder tiles, not the upload overlay.
        if (!Array.from(e.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={canUpload ? onCanvasDrop : undefined}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle style={{ fontSize: 28 }}>{title}</PageTitle>
          <p className="mt-1 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
            {subtitle ?? 'Folders and files on one canvas. Click a file for the panel (preview when available); drag a file onto a folder to move it.'}
          </p>
        </div>
        {canUpload ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setNewFolderDraft('');
                setMenu(null);
              }}
              disabled={busy || newFolderDraft !== null}
              className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-sm font-medium disabled:opacity-60"
              style={{ borderColor: 'var(--lp-border-strong)', background: 'var(--lp-surface)', color: 'var(--lp-text)' }}
            >
              <FolderPlus className="h-4 w-4" aria-hidden />
              New folder
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading || busy}
              className="btn-transition inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium disabled:opacity-60"
              style={{ background: 'var(--color-lp-orange)', color: 'var(--lp-text-inverse, #fff)' }}
            >
              <Upload className="h-4 w-4" aria-hidden />
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) void doUpload(files);
                e.target.value = '';
              }}
            />
          </div>
        ) : null}
      </div>

      {/* Breadcrumb */}
      <nav aria-label="Folder path" className="-mt-2 flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          onClick={() => setPath('')}
          className="btn-transition rounded px-1.5 py-0.5 hover:bg-[var(--lp-surface-hover)]"
          style={{
            color: segments.length === 0 ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
            fontWeight: segments.length === 0 ? 600 : 500,
          }}
        >
          Home
        </button>
        {segments.map((seg, i) => {
          const target = segments.slice(0, i + 1).join('/');
          const isLast = i === segments.length - 1;
          return (
            <Fragment key={target}>
              <ChevronRight size={14} aria-hidden style={{ color: 'var(--lp-text-tertiary)' }} />
              <button
                type="button"
                onClick={() => setPath(target)}
                className="btn-transition max-w-48 truncate rounded px-1.5 py-0.5 hover:bg-[var(--lp-surface-hover)]"
                style={{
                  color: isLast ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
                  fontWeight: isLast ? 600 : 500,
                }}
                aria-current={isLast ? 'location' : undefined}
              >
                {seg}
              </button>
            </Fragment>
          );
        })}
      </nav>

      {/* Drop-to-upload overlay banner */}
      {dragActive && canUpload ? (
        <div
          className="rounded-lg border-2 border-dashed p-8 text-center text-sm"
          style={{
            borderColor: 'var(--color-lp-orange)',
            color: 'var(--color-lp-orange)',
            background: 'color-mix(in srgb, var(--color-lp-orange) 6%, transparent)',
          }}
        >
          Drop to upload into {path ? `“${segments[segments.length - 1]}”` : 'Home'}
        </div>
      ) : null}

      {!hasAnything ? (
        /* Empty state — keeps the old surface's invitation voice, per folder. */
        <div
          className="flex flex-col items-center gap-3 rounded-lg border px-6 py-14 text-center"
          style={{ borderColor: 'var(--lp-border-strong)', background: 'var(--lp-panel)' }}
        >
          <FolderOpen size={30} strokeWidth={1.5} aria-hidden style={{ color: 'var(--lp-text-tertiary)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--lp-text)' }}>
            {path ? `Nothing in “${segments[segments.length - 1]}” yet` : 'No files yet'}
          </p>
          <p className="max-w-sm text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
            {canUpload
              ? path
                ? 'Drag files here, or use Upload — they’ll land in this folder.'
                : `Drag files here, or use Upload — contracts, tech packs, riders, anything for this ${scopeNoun}.`
              : 'Files uploaded elsewhere show up here.'}
          </p>
          {canUpload ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="btn-transition mt-1 inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium"
              style={{ background: 'var(--color-lp-orange)', color: 'var(--lp-text-inverse, #fff)' }}
            >
              <Upload className="h-4 w-4" aria-hidden /> {path ? 'Upload into this folder' : 'Upload the first file'}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {/* ---------- Folder tiles ---------- */}
          {childFolders.length > 0 || newFolderDraft !== null ? (
            <section className="space-y-2">
              {microLabel('Folders')}
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {newFolderDraft !== null ? (
                  <div
                    className="flex items-center gap-3 rounded-lg border px-3 py-3"
                    style={{ borderColor: 'var(--color-lp-orange)', background: 'var(--lp-surface)' }}
                  >
                    <Folder size={20} aria-hidden style={{ color: 'var(--color-lp-orange)' }} />
                    <input
                      autoFocus
                      value={newFolderDraft}
                      placeholder="Folder name"
                      aria-label="New folder name"
                      onChange={(e) => setNewFolderDraft(e.target.value)}
                      onBlur={commitNewFolder}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitNewFolder();
                        if (e.key === 'Escape') setNewFolderDraft(null);
                      }}
                      className="w-full min-w-0 bg-transparent text-sm font-medium outline-none"
                      style={{ color: 'var(--lp-text)' }}
                    />
                  </div>
                ) : null}

                {childFolders.map((name) => {
                  const full = path ? `${path}/${name}` : name;
                  const n = countUnder(full);
                  const hasSub = sortedFolderPaths.some((p) => p.startsWith(`${full}/`));
                  const deletable = n === 0 && !hasSub;
                  const isMenuOpen = menu?.kind === 'folder' && menu.path === full;
                  const isRenaming = renaming?.kind === 'folder' && renaming.path === full;
                  const isDropTarget = dropTarget === full;
                  return (
                    <div key={full} className="relative">
                      {/* div role="button" (not <button>) so the inline rename
                          input can nest without invalid interactive nesting —
                          same refactor reason as ArtistGridCard's card. */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (!isRenaming) setPath(full);
                        }}
                        onKeyDown={(e) => {
                          if (isRenaming) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setPath(full);
                          }
                        }}
                        onDragOver={(e) => {
                          if (!Array.from(e.dataTransfer.types).includes(FILE_DRAG_TYPE)) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setDropTarget(full);
                        }}
                        onDragLeave={() => setDropTarget((t) => (t === full ? null : t))}
                        onDrop={(e) => {
                          setDropTarget(null);
                          const rowId = e.dataTransfer.getData(FILE_DRAG_TYPE);
                          if (!rowId) return;
                          e.preventDefault();
                          e.stopPropagation();
                          const row = rows.find((r) => r.id === rowId);
                          if (row) void moveFile(row, full);
                        }}
                        className="btn-transition flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-left"
                        style={{
                          background: isDropTarget
                            ? 'color-mix(in srgb, var(--color-lp-orange) 8%, var(--lp-surface))'
                            : 'var(--lp-surface)',
                          borderColor: isDropTarget ? 'var(--color-lp-orange)' : 'var(--lp-border-strong)',
                        }}
                        aria-label={`Open folder ${name}`}
                      >
                        <Folder size={20} aria-hidden style={{ color: 'var(--color-lp-orange)', flexShrink: 0 }} />
                        <span className="flex min-w-0 flex-col">
                          {isRenaming ? (
                            <input
                              autoFocus
                              value={renaming.value}
                              aria-label={`Rename folder ${name}`}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setRenaming({ kind: 'folder', path: full, value: e.target.value })}
                              onBlur={() => void commitRename()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void commitRename();
                                if (e.key === 'Escape') setRenaming(null);
                              }}
                              className="w-full min-w-0 bg-transparent text-sm font-medium outline-none"
                              style={{ color: 'var(--lp-text)' }}
                            />
                          ) : (
                            <span className="truncate text-sm font-medium" style={{ color: 'var(--lp-text)' }}>
                              {name}
                            </span>
                          )}
                          <span className="lp-mono" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
                            {n} {n === 1 ? 'item' : 'items'}
                          </span>
                        </span>
                      </div>

                      {canUpload ? (
                        <div className="absolute" style={{ top: 6, right: 6 }} onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            aria-haspopup="menu"
                            aria-expanded={isMenuOpen}
                            aria-label={`Folder actions for ${name}`}
                            onClick={() => setMenu(isMenuOpen ? null : { kind: 'folder', path: full })}
                            className="btn-transition rounded p-1 hover:bg-[var(--lp-surface-hover)]"
                            style={{ color: 'var(--lp-text-tertiary)' }}
                          >
                            <MoreHorizontal size={16} aria-hidden />
                          </button>
                          {isMenuOpen ? (
                            <>
                              {backdrop}
                              <div role="menu" className="absolute right-0 mt-1 w-52 rounded-md border py-1" style={popoverStyle}>
                                {menuItem({
                                  label: 'Rename',
                                  icon: Pencil,
                                  onClick: () => {
                                    setRenaming({ kind: 'folder', path: full, value: name });
                                    setMenu(null);
                                  },
                                })}
                                {menuItem({
                                  label: 'Delete',
                                  icon: Trash2,
                                  danger: true,
                                  disabled: !deletable,
                                  title: deletable
                                    ? undefined
                                    : n > 0
                                      ? `Contains ${n} ${n === 1 ? 'item' : 'items'} — move or delete them first`
                                      : 'Contains subfolders — delete them first',
                                  onClick: () => deleteFolder(full),
                                })}
                              </div>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* ---------- File cards ---------- */}
          <section className="space-y-2">
            {microLabel('Files')}
            {filesHere.length === 0 ? (
              <div
                className="rounded-lg border border-dashed px-6 py-8 text-center text-sm"
                style={{ borderColor: 'var(--lp-border-strong)', color: 'var(--lp-text-secondary)', background: 'var(--lp-panel)' }}
              >
                {canUpload
                  ? path
                    ? 'Nothing in this folder yet — drag files here, or use Upload.'
                    : 'No loose files at Home — drag files here, or use Upload.'
                  : 'Files uploaded elsewhere show up here.'}
              </div>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {filesHere.map((row) => {
                  const refId = refIdOf(row);
                  const Icon = iconForFile(row.filename, row.mimeType);
                  const isMenuOpen = menu?.kind === 'file' && menu.rowId === row.id;
                  const isRenaming = renaming?.kind === 'file' && renaming.rowId === row.id;
                  const currentFolder = folderOf[row.id] ?? '';
                  return (
                    <div key={row.id} className="relative">
                      <div
                        role="button"
                        tabIndex={0}
                        draggable={refId !== null}
                        onDragStart={(e) => {
                          if (!refId) return;
                          e.dataTransfer.setData(FILE_DRAG_TYPE, row.id);
                          e.dataTransfer.setData('text/plain', row.filename);
                          e.dataTransfer.effectAllowed = 'move';
                          setDraggingFileId(row.id);
                        }}
                        onDragEnd={() => {
                          setDraggingFileId(null);
                          setDropTarget(null);
                        }}
                        onClick={() => {
                          if (!isRenaming) setSelected(row);
                        }}
                        onKeyDown={(e) => {
                          if (isRenaming) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelected(row);
                          }
                        }}
                        aria-label={`Open ${row.filename}`}
                        className="btn-transition flex w-full cursor-pointer flex-col overflow-hidden rounded-lg border text-left"
                        style={{
                          background: 'var(--lp-surface)',
                          borderColor: 'var(--lp-border-strong)',
                          opacity: draggingFileId === row.id ? 0.5 : 1,
                        }}
                      >
                        <div
                          className="flex items-center justify-center"
                          style={{ height: 84, background: 'var(--lp-panel)', borderBottom: '1px solid var(--lp-border)' }}
                        >
                          <Icon size={28} strokeWidth={1.5} aria-hidden style={{ color: 'var(--lp-text-tertiary)' }} />
                        </div>
                        <div className="flex flex-col gap-1 p-3">
                          {isRenaming ? (
                            <input
                              autoFocus
                              value={renaming.value}
                              aria-label={`Rename ${row.filename}`}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setRenaming({ kind: 'file', rowId: row.id, value: e.target.value })}
                              onBlur={() => void commitRename()}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter') void commitRename();
                                if (e.key === 'Escape') setRenaming(null);
                              }}
                              className="w-full min-w-0 bg-transparent text-sm font-medium outline-none"
                              style={{ color: 'var(--lp-text)' }}
                            />
                          ) : (
                            <span className="truncate pr-5 text-sm font-medium" style={{ color: 'var(--lp-text)' }}>
                              {row.filename}
                            </span>
                          )}
                          <span className="lp-mono" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
                            {fmtSize(row.size)} · {rel(row.uploadedAt)}
                          </span>
                        </div>
                      </div>

                      <div
                        className="absolute"
                        style={{ top: 6, right: 6 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          aria-haspopup="menu"
                          aria-expanded={isMenuOpen}
                          aria-label={`Actions for ${row.filename}`}
                          onClick={() => setMenu(isMenuOpen ? null : { kind: 'file', rowId: row.id, mode: 'menu' })}
                          className="btn-transition rounded p-1 hover:bg-[var(--lp-surface-hover)]"
                          style={{ color: 'var(--lp-text-tertiary)' }}
                        >
                          <MoreHorizontal size={16} aria-hidden />
                        </button>
                        {isMenuOpen ? (
                          <>
                            {backdrop}
                            <div role="menu" className="absolute right-0 mt-1 w-52 rounded-md border py-1" style={popoverStyle}>
                              {menu.mode === 'menu' ? (
                                <>
                                  {menuItem({
                                    label: 'Rename',
                                    icon: Pencil,
                                    disabled: !refId || !canUpload,
                                    title: refId ? undefined : managedHint,
                                    onClick: () => {
                                      setRenaming({ kind: 'file', rowId: row.id, value: row.filename });
                                      setMenu(null);
                                    },
                                  })}
                                  {menuItem({
                                    label: 'Move to…',
                                    icon: FolderInput,
                                    disabled: !refId || !canUpload,
                                    title: refId ? undefined : managedHint,
                                    onClick: () => setMenu({ kind: 'file', rowId: row.id, mode: 'move' }),
                                  })}
                                  {menuItem({
                                    label: 'Download',
                                    icon: Download,
                                    onClick: () => {
                                      setMenu(null);
                                      void downloadFile(row);
                                    },
                                  })}
                                  <div className="my-1" style={{ borderTop: '1px solid var(--lp-border)' }} />
                                  {menuItem({
                                    label: 'Delete…',
                                    icon: Trash2,
                                    danger: true,
                                    disabled: !refId || !canUpload,
                                    title: refId ? undefined : managedHint,
                                    onClick: () => {
                                      setMenu(null);
                                      void deleteFile(row);
                                    },
                                  })}
                                </>
                              ) : (
                                <div className="max-h-56 overflow-y-auto">
                                  <div
                                    className="lp-label-caps px-3 py-1"
                                    style={{
                                      fontSize: 'var(--lp-text-2xs)',
                                      letterSpacing: 'var(--lp-tracking-caps)',
                                      textTransform: 'uppercase',
                                      color: 'var(--lp-text-tertiary)',
                                    }}
                                  >
                                    Move to
                                  </div>
                                  {['', ...sortedFolderPaths]
                                    .filter((dest) => dest !== currentFolder)
                                    .map((dest) => (
                                      <button
                                        key={dest || '::home'}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                          setMenu(null);
                                          void moveFile(row, dest);
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--lp-surface-hover)]"
                                        style={{ color: 'var(--lp-text)' }}
                                      >
                                        <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden style={{ color: 'var(--lp-text-tertiary)' }} />
                                        <span className="truncate">{dest || 'Home'}</span>
                                      </button>
                                    ))}
                                </div>
                              )}
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {selected && <FileSlideOver file={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
