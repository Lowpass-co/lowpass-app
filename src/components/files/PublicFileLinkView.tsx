'use client';

/* ============================================
   LOWPASS — Public file / folder link view (Nov 2026)

   The page behind /f/[token]. States: loading → password? → error | ready.
   VIEW links: browse (folders), download. EDIT links: also add files to the
   folder (drag or choose) and upload a new version of any file — after
   giving a name, remembered in this browser. No delete, rename or move.

   The password is held in memory only and sent in POST bodies, never a URL.
   ============================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Download, File as FileIcon, Folder, FolderOpen, Lock, RefreshCw, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatBytes } from '@/lib/files/shareLinks';
import type { LinkContents, SharedFile } from '@/server/files/shareLinks';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, tooLargeMessage } from '@/lib/uploads/limits';
import { uploadDirect, type DirectTarget } from '@/lib/uploads/directUpload';

async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `Upload failed (${r.status})`);
  return j;
}

type State = { s: 'loading' } | { s: 'password'; wrong: boolean } | { s: 'error'; title: string; body: string } | { s: 'ready'; data: LinkContents };

interface Job {
  id: string;
  name: string;
  status: 'up' | 'done' | 'failed';
  pct?: number;
  message?: string;
}

const NAME_KEY = 'lp-share-name';
const readName = () => {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
};
const saveName = (n: string) => {
  try {
    window.localStorage.setItem(NAME_KEY, n);
  } catch {
    /* not remembered */
  }
};

const ERRORS: Record<string, { title: string; body: string }> = {
  not_found: {
    title: 'This link doesn’t exist',
    body: 'Check you have the whole link, or ask whoever sent it for a new one.',
  },
  revoked: {
    title: 'This link has been turned off',
    body: 'Ask whoever sent it for a new one.',
  },
  expired: {
    title: 'This link has expired',
    body: 'Ask whoever sent it for a new one.',
  },
};

export function PublicFileLinkView({ token }: { token: string }) {
  const [state, setState] = useState<State>({ s: 'loading' });
  const [password, setPassword] = useState<string | null>(null);
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [drag, setDrag] = useState(false);
  const addInput = useRef<HTMLInputElement | null>(null);
  const versionInput = useRef<HTMLInputElement | null>(null);
  const versionFor = useRef<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => setName(readName()));
  }, []);

  const load = useCallback(
    async (pw: string | null) => {
      try {
        const r = await fetch(`/api/public/file-link/${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pw ? { password: pw } : {}),
        });
        const j = (await r.json().catch(() => ({}))) as Partial<LinkContents> & {
          code?: string;
          error?: string;
        };
        if (j.code === 'password_required' || j.code === 'invalid_password')
          return setState({
            s: 'password',
            wrong: j.code === 'invalid_password',
          });
        if (!r.ok) {
          const e = ERRORS[j.code ?? ''] ?? {
            title: 'Couldn’t open this link',
            body: j.error ?? 'Try again in a moment.',
          };
          return setState({ s: 'error', ...e });
        }
        setPassword(pw);
        setState({ s: 'ready', data: j as LinkContents });
      } catch {
        setState({
          s: 'error',
          title: 'Couldn’t open this link',
          body: 'Check your connection and try again.',
        });
      }
    },
    [token],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  const download = async (f: SharedFile) => {
    const r = await fetch(`/api/public/file-link/${encodeURIComponent(token)}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: f.id, password, name: name || null }),
    });
    const j = (await r.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };
    if (!r.ok || !j.url)
      return setJobs((x) => [
        {
          id: `d${Date.now()}`,
          name: f.name,
          status: 'failed',
          message: j.error ?? 'Download failed',
        },
        ...x,
      ]);
    window.location.href = j.url;
  };

  const upload = async (files: File[], replaceFileId: string | null) => {
    const who = name.trim();
    if (!who) return;
    saveName(who);
    for (const file of files) {
      const id = `${Date.now()}-${file.name}`;
      setJobs((x) => [{ id, name: file.name, status: 'up' }, ...x]);
      const base = `/api/public/file-link/${encodeURIComponent(token)}`;
      const common = { password, name: who, folder: replaceFileId ? null : path || null, replaceFileId };
      try {
        if (file.size > MAX_UPLOAD_BYTES) throw new Error(tooLargeMessage());
        // Ask → send straight to Storage (resumable when big) → finish.
        const target = await postJson<DirectTarget>(`${base}/upload-url`, { ...common, file: { name: file.name, size: file.size } });
        await uploadDirect(target, file, {
          onProgress: (f) => setJobs((x) => x.map((k) => (k.id === id ? { ...k, pct: Math.round(f * 100) } : k))),
        });
        await postJson(`${base}/complete`, { ...common, path: target.path, fileName: file.name });
        setJobs((x) =>
          x.map((k) =>
            k.id === id
              ? {
                  ...k,
                  status: 'done',
                  message: replaceFileId ? 'New version saved' : 'Added',
                }
              : k,
          ),
        );
      } catch (e) {
        setJobs((x) =>
          x.map((k) =>
            k.id === id
              ? {
                  ...k,
                  status: 'failed',
                  message: e instanceof Error ? e.message : 'Upload failed',
                }
              : k,
          ),
        );
      }
    }
    await load(password);
  };

  if (state.s === 'loading')
    return (
      <Shell>
        <p style={muted}>Opening…</p>
      </Shell>
    );

  if (state.s === 'error') {
    return (
      <Shell>
        <div
          className="lp-onb-rise"
          style={{
            ...panel,
            textAlign: 'center',
            padding: 'var(--lp-space-8) var(--lp-space-6)',
          }}
        >
          <FolderOpen
            size={28}
            aria-hidden
            style={{
              color: 'var(--lp-text-tertiary)',
              margin: '0 auto var(--lp-space-3)',
            }}
          />
          <h1 style={{ ...h1, fontSize: 'var(--lp-text-lg)' }}>{state.title}</h1>
          <p style={{ ...muted, marginTop: 'var(--lp-space-2)' }}>{state.body}</p>
        </div>
      </Shell>
    );
  }

  if (state.s === 'password') {
    return (
      <Shell>
        <form
          className="lp-onb-rise"
          style={{
            ...panel,
            maxWidth: 380,
            margin: '0 auto',
            padding: 'var(--lp-space-6)',
          }}
          onSubmit={(e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget).get('pw');
            void load(typeof v === 'string' ? v : '');
          }}
        >
          <Lock size={22} aria-hidden style={{ color: 'var(--lp-text-secondary)' }} />
          <h1
            style={{
              ...h1,
              fontSize: 'var(--lp-text-lg)',
              marginTop: 'var(--lp-space-3)',
            }}
          >
            This link needs a password
          </h1>
          <input
            name="pw"
            type="password"
            autoFocus
            aria-label="Password"
            placeholder="Password"
            style={{ ...inputStyle, marginTop: 'var(--lp-space-4)' }}
          />
          {state.wrong ? (
            <p
              role="alert"
              style={{
                ...muted,
                color: 'var(--color-lp-error)',
                marginTop: 'var(--lp-space-2)',
              }}
            >
              That password isn’t right.
            </p>
          ) : null}
          <Button type="submit" variant="primary" size="md" block style={{ marginTop: 'var(--lp-space-4)' }}>
            Open
          </Button>
        </form>
      </Shell>
    );
  }

  const d = state.data;
  const edit = d.access === 'edit';
  const here = d.files.filter((f) => f.folder === path);
  const subfolders = d.folders.filter((f) => (path ? f.startsWith(`${path}/`) && !f.slice(path.length + 1).includes('/') : !f.includes('/')));
  const crumbs = path ? path.split('/') : [];
  const needName = edit && !name.trim();
  const who = [d.artistName, d.tourName].filter(Boolean).join(' · ');

  return (
    <Shell>
      {/* Header */}
      <header
        className="lp-onb-rise"
        style={{
          ...panel,
          padding: 'var(--lp-space-5) var(--lp-space-6)',
          background: 'radial-gradient(120% 140% at 0% 0%, #FF450014, transparent 60%), var(--lp-surface)',
        }}
      >
        {who ? (
          <div
            style={{
              fontSize: 'var(--lp-text-xs)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-orange)',
            }}
          >
            {who}
          </div>
        ) : null}
        <div className="flex items-center" style={{ gap: 'var(--lp-space-3)', marginTop: 'var(--lp-space-1)' }}>
          {d.kind === 'folder' ? (
            <Folder size={22} aria-hidden style={{ color: 'var(--lp-text-secondary)', flexShrink: 0 }} />
          ) : (
            <FileIcon size={22} aria-hidden style={{ color: 'var(--lp-text-secondary)', flexShrink: 0 }} />
          )}
          <h1 className="min-w-0 truncate" style={h1}>
            {d.title}
          </h1>
        </div>
        <div className="flex flex-wrap items-center" style={{ gap: 'var(--lp-space-2)', marginTop: 'var(--lp-space-3)' }}>
          <span
            style={{
              ...chip,
              ...(edit ? { borderColor: 'var(--lp-orange)', color: 'var(--lp-text)' } : {}),
            }}
          >
            {edit ? (d.kind === 'folder' ? 'You can add files and upload new versions' : 'You can upload a new version') : 'View only'}
          </span>
          {d.expiresAt ? (
            <span style={chip}>
              Link expires{' '}
              {new Date(d.expiresAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          ) : null}
        </div>
      </header>

      {d.gone ? (
        <div
          style={{
            ...panel,
            marginTop: 'var(--lp-space-4)',
            padding: 'var(--lp-space-6)',
            textAlign: 'center',
          }}
        >
          <p style={muted}>This file has been removed.</p>
        </div>
      ) : (
        <>
          {/* Your name (edit links) */}
          {edit ? (
            <div
              className="flex flex-wrap items-center"
              style={{
                ...panel,
                marginTop: 'var(--lp-space-4)',
                padding: 'var(--lp-space-3) var(--lp-space-4)',
                gap: 'var(--lp-space-3)',
              }}
            >
              <label
                htmlFor="who"
                style={{
                  fontSize: 'var(--lp-text-sm)',
                  color: 'var(--lp-text-secondary)',
                }}
              >
                Your name
              </label>
              <input
                id="who"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => name.trim() && saveName(name.trim())}
                maxLength={60}
                placeholder="So they know who sent it"
                style={{ ...inputStyle, flex: '1 1 200px', width: 'auto' }}
              />
            </div>
          ) : null}

          {/* Breadcrumb */}
          {d.kind === 'folder' && (crumbs.length || subfolders.length) ? (
            <nav
              aria-label="Folder"
              className="flex flex-wrap items-center"
              style={{
                gap: 'var(--lp-space-1)',
                margin: 'var(--lp-space-5) 0 var(--lp-space-2)',
                fontSize: 'var(--lp-text-sm)',
              }}
            >
              <button type="button" onClick={() => setPath('')} style={crumbBtn(path === '')}>
                {d.title}
              </button>
              {crumbs.map((c, i) => (
                <span key={i} className="inline-flex items-center" style={{ gap: 'var(--lp-space-1)' }}>
                  <ChevronRight size={14} aria-hidden style={{ color: 'var(--lp-text-tertiary)' }} />
                  <button type="button" onClick={() => setPath(crumbs.slice(0, i + 1).join('/'))} style={crumbBtn(i === crumbs.length - 1)}>
                    {c}
                  </button>
                </span>
              ))}
            </nav>
          ) : (
            <div style={{ height: 'var(--lp-space-4)' }} />
          )}

          {/* Subfolders */}
          {subfolders.length ? (
            <div
              className="grid"
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 'var(--lp-space-2)',
                marginBottom: 'var(--lp-space-3)',
              }}
            >
              {subfolders.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setPath(f)}
                  className="btn-transition flex items-center text-left hover:bg-lp-surface-hover"
                  style={{
                    ...panel,
                    gap: 'var(--lp-space-2)',
                    padding: 'var(--lp-space-3)',
                    cursor: 'pointer',
                  }}
                >
                  <Folder size={16} aria-hidden style={{ color: 'var(--lp-text-secondary)', flexShrink: 0 }} />
                  <span
                    className="truncate"
                    style={{
                      fontSize: 'var(--lp-text-sm)',
                      color: 'var(--lp-text)',
                    }}
                  >
                    {f.split('/').pop()}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {/* Files */}
          <ul
            style={{
              ...panel,
              listStyle: 'none',
              margin: 0,
              padding: 0,
              overflow: 'hidden',
            }}
          >
            {here.length === 0 ? (
              <li
                style={{
                  ...muted,
                  padding: 'var(--lp-space-6)',
                  textAlign: 'center',
                }}
              >
                {edit ? 'Nothing here yet — add the first file below.' : 'Nothing in this folder.'}
              </li>
            ) : null}
            {here.map((f, i) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center"
                style={{
                  gap: 'var(--lp-space-2) var(--lp-space-3)',
                  padding: 'var(--lp-space-3) var(--lp-space-4)',
                  borderTop: i ? '1px solid var(--lp-border)' : 0,
                }}
              >
                <div className="flex min-w-0 items-center" style={{ flex: '1 1 240px', gap: 'var(--lp-space-3)' }}>
                  <FileIcon size={18} aria-hidden style={{ color: 'var(--lp-text-tertiary)', flexShrink: 0 }} />
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate"
                      style={{
                        fontSize: 'var(--lp-text-sm)',
                        fontWeight: 'var(--lp-weight-medium)',
                        color: 'var(--lp-text)',
                      }}
                    >
                      {f.name}
                    </div>
                    <div
                      style={{
                        fontSize: 'var(--lp-text-xs)',
                        color: 'var(--lp-text-secondary)',
                      }}
                    >
                      {formatBytes(f.size)} · added{' '}
                      {new Date(f.addedAt).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                      })}
                      {f.versions ? ` · version ${f.versions + 1}` : ''}
                    </div>
                  </div>
                </div>
                {/* Actions wrap under the name on narrow screens instead of crushing it. */}
                <div className="flex items-center" style={{ gap: 'var(--lp-space-2)', marginLeft: 'auto' }}>
                  {edit && f.available ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={needName}
                      title={needName ? 'Add your name first' : undefined}
                      leadingIcon={<RefreshCw size={13} aria-hidden />}
                      onClick={() => {
                        versionFor.current = f.id;
                        versionInput.current?.click();
                      }}
                    >
                      New version
                    </Button>
                  ) : null}
                  {f.available ? (
                    <Button variant="secondary" size="sm" leadingIcon={<Download size={13} aria-hidden />} onClick={() => void download(f)}>
                      Download
                    </Button>
                  ) : (
                    <span
                      style={{
                        fontSize: 'var(--lp-text-xs)',
                        color: 'var(--lp-text-tertiary)',
                      }}
                    >
                      Not available here
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Add files (edit folder links) */}
          {edit && d.kind === 'folder' ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (!needName) setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                if (!needName) void upload([...e.dataTransfer.files], null);
              }}
              className="btn-transition flex flex-col items-center text-center"
              style={{
                marginTop: 'var(--lp-space-4)',
                padding: 'var(--lp-space-6)',
                borderRadius: 'var(--lp-radius-lg)',
                border: `1.5px dashed ${drag ? 'var(--lp-orange)' : 'var(--lp-border-strong)'}`,
                background: drag ? '#FF45000d' : 'transparent',
                gap: 'var(--lp-space-2)',
              }}
            >
              <Upload
                size={20}
                aria-hidden
                style={{
                  color: drag ? 'var(--lp-orange)' : 'var(--lp-text-tertiary)',
                }}
              />
              <div
                style={{
                  fontSize: 'var(--lp-text-sm)',
                  color: 'var(--lp-text)',
                }}
              >
                Drop files to add them to <strong>{path ? path.split('/').pop() : d.title}</strong>
              </div>
              <div style={muted}>{needName ? 'Add your name above first.' : `Up to ${MAX_UPLOAD_MB} MB each.`}</div>
              <Button variant="secondary" size="sm" disabled={needName} onClick={() => addInput.current?.click()}>
                Choose files
              </Button>
            </div>
          ) : null}

          <input
            ref={addInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const fs = [...(e.target.files ?? [])];
              e.target.value = '';
              void upload(fs, null);
            }}
          />
          <input
            ref={versionInput}
            type="file"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f && versionFor.current) void upload([f], versionFor.current);
            }}
          />

          {/* Upload progress */}
          {jobs.length ? (
            <ul
              aria-live="polite"
              style={{
                listStyle: 'none',
                margin: 'var(--lp-space-4) 0 0',
                padding: 0,
              }}
            >
              {jobs.slice(0, 8).map((j) => (
                <li
                  key={j.id}
                  className="lp-onb-rise flex items-center"
                  style={{
                    gap: 'var(--lp-space-2)',
                    padding: 'var(--lp-space-1) 0',
                    fontSize: 'var(--lp-text-xs)',
                    color: j.status === 'failed' ? 'var(--color-lp-error)' : 'var(--lp-text-secondary)',
                  }}
                >
                  {j.status === 'failed' ? <X size={12} aria-hidden /> : <Upload size={12} aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">{j.name}</span>
                  <span>{j.status === 'up' ? `Uploading${j.pct ? ` ${j.pct}%` : '…'}` : j.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--lp-dashboard-bg)',
        padding: 'var(--lp-space-8) var(--lp-space-4)',
      }}
    >
      <div style={{ maxWidth: 760, margin: '0 auto' }}>{children}</div>
      <footer
        style={{
          ...muted,
          textAlign: 'center',
          marginTop: 'var(--lp-space-8)',
          fontSize: 'var(--lp-text-2xs)',
        }}
      >
        Shared via Lowpass
      </footer>
    </main>
  );
}

const panel: React.CSSProperties = {
  borderRadius: 'var(--lp-radius-lg)',
  border: '1px solid var(--lp-border)',
  background: 'var(--lp-surface)',
};
const h1: React.CSSProperties = {
  margin: 0,
  fontSize: 'var(--lp-text-2xl)',
  fontWeight: 'var(--lp-weight-semibold)',
  color: 'var(--lp-text)',
  letterSpacing: '-0.01em',
};
const muted: React.CSSProperties = {
  margin: 0,
  fontSize: 'var(--lp-text-sm)',
  color: 'var(--lp-text-secondary)',
};
const chip: React.CSSProperties = {
  fontSize: 'var(--lp-text-xs)',
  padding: 'var(--lp-space-1) var(--lp-space-3)',
  borderRadius: 'var(--lp-radius-full)',
  border: '1px solid var(--lp-border-strong)',
  color: 'var(--lp-text-secondary)',
  background: 'var(--lp-panel)',
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  padding: 'var(--lp-space-2) var(--lp-space-3)',
  fontSize: 'var(--lp-text-sm)',
  color: 'var(--lp-text)',
  background: 'var(--lp-bg)',
  border: '1px solid var(--lp-border)',
  borderRadius: 'var(--lp-radius-md)',
  outline: 'none',
};
const crumbBtn = (current: boolean): React.CSSProperties => ({
  padding: 0,
  border: 0,
  background: 'none',
  cursor: 'pointer',
  color: current ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
  fontWeight: current ? 'var(--lp-weight-semibold)' : 'var(--lp-weight-regular)',
});
