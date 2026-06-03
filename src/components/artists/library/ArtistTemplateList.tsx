'use client';

/* ============================================
   LOWPASS — <ArtistTemplateList> (Sprint 12 §7)

   Shared client surface for the four artist-library list
   views. Renders one row per template (rider_packs row at
   scope='artist' with matching kind), each with:

     - title (links to /rider-packs/[id] for editing)
     - last-updated relative timestamp
     - "On N tours" derived count
     - "Assign to tour ▾" affordance opening <AssignToTourDialog>

   The "+ New template" affordance at the top POSTs to the
   existing /api/rider-packs endpoint with the kind in the
   body, then routes to the editor for the freshly-created
   pack so the operator can fill it out immediately.

   Empty state copy is passed in via the `empty` prop so each
   surface (riders / channel-lists) can speak its own voice.

   Propagation modal (Sprint 12 §7.1) is deferred. Saving an
   artist template here won't yet prompt to refresh tour-scope
   copies; that flow lands in §7.1.
   ============================================ */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Plus, ListTodo } from 'lucide-react';
import { AssignToTourDialog } from './AssignToTourDialog';

export interface ArtistTemplateRow {
  id: string;
  title: string | null;
  updated_at: string;
  /** Count of tour-scope folders that inherit from this
   *  template's folder. 0 means the template is unassigned. */
  assigned_count: number;
}

export interface ArtistTourOption {
  id: string;
  name: string;
}

interface ArtistTemplateListProps {
  artistId: string;
  artistName: string;
  /** 'rider' | 'channel_list' — passed through to the create
   *  POST and the assign-to-tour route. */
  kind: 'rider' | 'channel_list';
  /** Single noun like "rider" or "channel list". Used in the
   *  "+ New {label}" button + the empty-state copy. */
  label: string;
  rows: ArtistTemplateRow[];
  /** Tours under this artist, fed to the AssignToTourDialog
   *  picker. Server component fetches them once per page
   *  load. */
  tours: ArtistTourOption[];
  empty: string;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 0) return 'just now';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function ArtistTemplateList({
  artistId,
  artistName,
  kind,
  label,
  rows,
  tours,
  empty,
}: ArtistTemplateListProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<ArtistTemplateRow | null>(null);

  async function handleNew() {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/rider-packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'artist',
          artist_id: artistId,
          kind,
          title: `New ${label}`,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { id?: string; error?: string }
        | null;
      if (!res.ok || !body?.id) {
        setCreateError(body?.error ?? `Create failed (${res.status})`);
        return;
      }
      // §RA14 — a freshly created rider template opens straight into the
      // builder; channel_list keeps the legacy editor (bare path).
      router.push(`/rider-packs/${body.id}${kind === 'rider' ? '?mode=edit' : ''}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--lp-space-4)',
        padding: 'var(--lp-space-6)',
        maxWidth: 960,
        margin: '0 auto',
      }}
    >
      <header
        className="flex items-end justify-between"
        style={{ gap: 'var(--lp-space-3)' }}
      >
        <div className="min-w-0">
          <p
            style={{
              fontSize: 'var(--lp-text-xs)',
              color: 'var(--lp-text-tertiary)',
              marginBottom: 'var(--lp-space-1)',
            }}
          >
            {artistName} · {label} templates
          </p>
          <h1
            className="lp-h2"
            style={{
              margin: 0,
              fontSize: 'var(--lp-text-2xl)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-text)',
            }}
          >
            {artistName} — {label} templates
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void handleNew()}
          disabled={creating}
          className="btn-transition btn-primary-press inline-flex items-center"
          style={{
            gap: 6,
            padding: 'var(--lp-space-2) var(--lp-space-4)',
            fontSize: 'var(--lp-text-sm)',
            fontWeight: 'var(--lp-weight-semibold)',
            color: 'var(--lp-text-inverse)',
            background: 'var(--color-lp-orange)',
            border: '1px solid transparent',
            borderRadius: 'var(--lp-radius-md)',
            cursor: creating ? 'not-allowed' : 'pointer',
            opacity: creating ? 0.7 : 1,
          }}
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          New {label}
        </button>
      </header>

      {createError ? (
        <div
          role="alert"
          style={{
            padding: 'var(--lp-space-2) var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--color-lp-error)',
            background: 'color-mix(in srgb, var(--color-lp-error) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-lp-error) 25%, transparent)',
            borderRadius: 'var(--lp-radius-md)',
          }}
        >
          {createError}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div
          style={{
            padding: 'var(--lp-space-6)',
            textAlign: 'center',
            border: '1px dashed var(--lp-border)',
            borderRadius: 'var(--lp-radius-lg)',
            background: 'var(--lp-panel)',
            color: 'var(--lp-text-secondary)',
          }}
        >
          <ListTodo
            size={24}
            style={{
              marginInline: 'auto',
              marginBottom: 'var(--lp-space-2)',
              color: 'var(--lp-text-tertiary)',
            }}
          />
          <p style={{ margin: 0, fontSize: 'var(--lp-text-sm)' }}>{empty}</p>
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            border: '1px solid var(--lp-border)',
            borderRadius: 'var(--lp-radius-lg)',
            overflow: 'hidden',
            background: 'var(--lp-panel)',
          }}
        >
          {rows.map((row, idx) => (
            <li
              key={row.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto auto auto',
                alignItems: 'center',
                gap: 'var(--lp-space-3)',
                padding: 'var(--lp-space-3) var(--lp-space-4)',
                borderBottom:
                  idx < rows.length - 1 ? '1px solid var(--lp-border-subtle)' : 'none',
              }}
            >
              <Link
                /* §RA14 — rider templates open the new shell in builder
                   mode (artist-scope templates are the structure source).
                   channel_list rows keep the bare path (legacy PackEditor). */
                href={`/rider-packs/${row.id}${kind === 'rider' ? '?mode=edit' : ''}`}
                style={{
                  minWidth: 0,
                  fontSize: 'var(--lp-text-sm)',
                  fontWeight: 'var(--lp-weight-semibold)',
                  color: 'var(--lp-text)',
                  textDecoration: 'none',
                }}
                className="truncate hover:underline"
              >
                {row.title?.trim() || `Untitled ${label}`}
              </Link>
              <span
                style={{
                  fontSize: 'var(--lp-text-xs)',
                  color: 'var(--lp-text-tertiary)',
                }}
              >
                Updated {formatRelative(row.updated_at)}
              </span>
              <span
                style={{
                  fontSize: 'var(--lp-text-xs)',
                  fontWeight: 'var(--lp-weight-medium)',
                  color:
                    row.assigned_count > 0
                      ? 'var(--lp-text-secondary)'
                      : 'var(--lp-text-tertiary)',
                }}
              >
                On {row.assigned_count} tour{row.assigned_count === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={() => setAssignFor(row)}
                className="btn-transition"
                style={{
                  padding: 'var(--lp-space-1) var(--lp-space-3)',
                  fontSize: 'var(--lp-text-xs)',
                  fontWeight: 'var(--lp-weight-semibold)',
                  color: 'var(--lp-text-secondary)',
                  background: 'transparent',
                  border: '1px solid var(--lp-border-strong)',
                  borderRadius: 'var(--lp-radius-md)',
                  cursor: 'pointer',
                }}
              >
                Assign to tour…
              </button>
            </li>
          ))}
        </ul>
      )}

      {assignFor ? (
        <AssignToTourDialog
          template={assignFor}
          tours={tours}
          kindLabel={label}
          onClose={() => setAssignFor(null)}
          onAssigned={() => {
            setAssignFor(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
