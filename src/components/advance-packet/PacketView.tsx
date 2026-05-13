'use client';

/* ============================================
   LOWPASS — <PacketView> (Sprint 12 §11b)

   Client surface for /advance/[tourId]/[routingId]/packet:

     - Header: tour + routing context, "Back to advance" link
     - Documents: list of riders / channel lists / hire jobs
       with Edit + per-doc PDF buttons
     - Share section: link URL with Copy + Regenerate, password
       set/clear, "Last viewed" timestamp
     - Bundled PDF: prominent download button at top-right.
       Hits /api/advance-packets/[tourId]/[routingId]/pdf —
       currently a §10 stub returning 501; §11c replaces with
       the real concatenation pipeline.

   Token-clean: every visual value via var(--lp-…) tokens.
   No hard-coded greys / shadows / spacings.
   ============================================ */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Copy,
  Download,
  FileText,
  Loader2,
  LockKeyhole,
  Package,
  RefreshCw,
  Sliders,
  Trash2,
} from 'lucide-react';
import type { PacketManifest, PacketDoc } from '@/lib/advance-packet/manifest';

interface ActiveLink {
  id: string;
  token: string;
  has_password: boolean;
  created_at: string;
  last_viewed_at: string | null;
}

interface Props {
  tourId: string;
  routingId: string;
  manifest: PacketManifest;
  initialLink: ActiveLink | null;
}

const DOC_ICON: Record<PacketDoc['kind'], typeof FileText> = {
  rider: FileText,
  channel_list: Sliders,
  rental_job: Package,
};

const DOC_KIND_LABEL: Record<PacketDoc['kind'], string> = {
  rider: 'Rider',
  channel_list: 'Channel list',
  rental_job: 'Hire job',
};

export function PacketView({ tourId, routingId, manifest, initialLink }: Props) {
  const router = useRouter();
  const [link, setLink] = useState<ActiveLink | null>(initialLink);
  const [creating, setCreating] = useState(false);
  const [pwDraft, setPwDraft] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /* Origin is window.location.origin once mounted. Pre-mount
     we render the path-only form so SSR + first paint match. */
  const fullUrl = useMemo(() => {
    if (!link) return null;
    const path = `/a/${link.token}`;
    if (typeof window === 'undefined') return path;
    return `${window.location.origin}${path}`;
  }, [link]);

  const createLink = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/advance-packets/${tourId}/${routingId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => ({}))) as {
        link?: { id: string; token: string; has_password: boolean; created_at: string };
        error?: string;
      };
      if (!res.ok || !json.link) {
        setError(json.error ?? 'Could not create share link.');
        return;
      }
      setLink({
        id: json.link.id,
        token: json.link.token,
        has_password: json.link.has_password,
        created_at: json.link.created_at,
        last_viewed_at: null,
      });
    } finally {
      setCreating(false);
    }
  }, [tourId, routingId]);

  const regenerateLink = useCallback(async () => {
    if (!link) return;
    if (!confirm('Revoke the current link and generate a new one?')) return;
    setCreating(true);
    setError(null);
    try {
      /* Two-step: revoke the existing link, then create a
         new one. Doing them server-side in one call would be
         nicer but the CRUD surface stays minimal for §11a. */
      await fetch(`/api/advance-packet-links/${link.id}`, { method: 'DELETE' });
      const res = await fetch(`/api/advance-packets/${tourId}/${routingId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => ({}))) as {
        link?: { id: string; token: string; has_password: boolean; created_at: string };
        error?: string;
      };
      if (!res.ok || !json.link) {
        setError(json.error ?? 'Could not regenerate link.');
        return;
      }
      setLink({
        id: json.link.id,
        token: json.link.token,
        has_password: json.link.has_password,
        created_at: json.link.created_at,
        last_viewed_at: null,
      });
    } finally {
      setCreating(false);
    }
  }, [link, tourId, routingId]);

  const revokeLink = useCallback(async () => {
    if (!link) return;
    if (!confirm('Revoke this share link? Anyone with the URL will lose access.')) return;
    const res = await fetch(`/api/advance-packet-links/${link.id}`, { method: 'DELETE' });
    if (res.ok) {
      setLink(null);
    } else {
      setError('Could not revoke link.');
    }
  }, [link]);

  const setPassword = useCallback(
    async (raw: string | null) => {
      if (!link) return;
      setPwBusy(true);
      try {
        const res = await fetch(`/api/advance-packet-links/${link.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: raw }),
        });
        if (res.ok) {
          const json = (await res.json()) as { has_password: boolean };
          setLink({ ...link, has_password: json.has_password });
          setPwDraft('');
          setPwOpen(false);
        } else {
          setError('Could not update password.');
        }
      } finally {
        setPwBusy(false);
      }
    },
    [link],
  );

  const copyUrl = useCallback(async () => {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Old browsers without clipboard API — fall back to
         selecting the input so the user can manually copy. */
      const input = document.getElementById('packet-share-url') as HTMLInputElement | null;
      input?.select();
    }
  }, [fullUrl]);

  const routingLabel = manifest.routing
    ? formatRoutingLabel(manifest.routing)
    : 'All shows';

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/advance/${tourId}/${routingId}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-lp-text-secondary hover:text-lp-text"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to advance
          </Link>
          <h1 className="mt-1 truncate text-xl font-bold text-lp-text">
            Advance Packet — {manifest.tour.name}
          </h1>
          <p className="text-sm text-lp-text-secondary">{routingLabel}</p>
        </div>
        <a
          href={`/api/advance-packets/${tourId}/${routingId}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-lp-orange px-3 py-2 text-sm font-medium text-white hover:bg-lp-orange/90"
        >
          <Download className="h-4 w-4" />
          Download bundled PDF
        </a>
      </header>

      <section className="rounded-xl border border-lp-border bg-lp-surface">
        <h2 className="border-b border-lp-border px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-lp-text-tertiary">
          Documents ({manifest.docs.length})
        </h2>
        {manifest.docs.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-lp-text-secondary">
            No documents in this packet yet. Add a rider, channel list, or hire job to
            this tour, then return here.
          </p>
        ) : (
          <ul className="divide-y divide-lp-border">
            {manifest.docs.map((doc) => (
              <DocRow key={`${doc.kind}-${doc.id}`} doc={doc} />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-lp-border bg-lp-surface">
        <h2 className="border-b border-lp-border px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-lp-text-tertiary">
          Public share
        </h2>
        <div className="space-y-3 p-4">
          {!link ? (
            <div className="space-y-2">
              <p className="text-sm text-lp-text-secondary">
                Generate a public URL recipients can open without a Lowpass account.
              </p>
              <button
                type="button"
                onClick={createLink}
                disabled={creating}
                className="inline-flex items-center gap-2 rounded-lg bg-lp-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-lp-orange/90 disabled:opacity-50"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Generate share link
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <input
                  id="packet-share-url"
                  type="text"
                  readOnly
                  value={fullUrl ?? ''}
                  className="min-w-0 flex-1 rounded-lg border border-lp-border bg-lp-bg px-3 py-1.5 font-mono text-xs text-lp-text"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  onClick={copyUrl}
                  className="inline-flex items-center gap-1 rounded-lg border border-lp-border px-2 py-1.5 text-xs font-medium text-lp-text hover:bg-lp-surface-hover"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={regenerateLink}
                  disabled={creating}
                  className="inline-flex items-center gap-1 rounded-lg border border-lp-border px-2 py-1.5 text-xs font-medium text-lp-text hover:bg-lp-surface-hover disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Regenerate
                </button>
                <button
                  type="button"
                  onClick={revokeLink}
                  className="inline-flex items-center gap-1 rounded-lg border border-lp-border px-2 py-1.5 text-xs font-medium text-lp-error hover:bg-lp-surface-hover"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Revoke
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-lp-text-tertiary">
                <span className="inline-flex items-center gap-1">
                  <LockKeyhole className="h-3 w-3" />
                  {link.has_password ? 'Password protected' : 'No password'}
                </span>
                <button
                  type="button"
                  onClick={() => setPwOpen((v) => !v)}
                  className="font-medium text-lp-orange hover:underline"
                >
                  {link.has_password ? 'Change / remove' : 'Set password'}
                </button>
                {link.last_viewed_at && (
                  <span>Last viewed: {formatViewedAt(link.last_viewed_at)}</span>
                )}
              </div>

              {pwOpen && (
                <div className="space-y-2 rounded-lg border border-lp-border bg-lp-bg p-3">
                  <input
                    type="password"
                    value={pwDraft}
                    onChange={(e) => setPwDraft(e.target.value)}
                    placeholder="New password (blank = none)"
                    className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-1.5 text-sm text-lp-text"
                  />
                  <div className="flex items-center justify-end gap-2">
                    {link.has_password && (
                      <button
                        type="button"
                        onClick={() => setPassword(null)}
                        disabled={pwBusy}
                        className="text-xs font-medium text-lp-text-secondary hover:text-lp-text"
                      >
                        Remove password
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPassword(pwDraft || null)}
                      disabled={pwBusy}
                      className="inline-flex items-center gap-1 rounded-lg bg-lp-orange px-3 py-1.5 text-xs font-medium text-white hover:bg-lp-orange/90 disabled:opacity-50"
                    >
                      {pwBusy && <Loader2 className="h-3 w-3 animate-spin" />}
                      Save password
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {error && <p className="text-xs text-lp-error">{error}</p>}
        </div>
      </section>

      <div className="text-right">
        <button
          type="button"
          onClick={() => router.refresh()}
          className="text-xs text-lp-text-tertiary hover:text-lp-text"
        >
          Refresh manifest
        </button>
      </div>
    </div>
  );
}

function DocRow({ doc }: { doc: PacketDoc }) {
  const Icon = DOC_ICON[doc.kind];
  /* Edit URL by kind. Riders + channel lists open in the
     rider editor; rental jobs open the equipment view with
     the job pre-selected. */
  const editHref = (() => {
    if (doc.kind === 'rental_job') return `/equipment?job=${encodeURIComponent(doc.id)}`;
    return `/rider-packs/${encodeURIComponent(doc.id)}`;
  })();
  const pdfHref =
    doc.kind === 'rider' || doc.kind === 'channel_list'
      ? `/api/rider-packs/${encodeURIComponent(doc.id)}/pdf`
      : null;

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Icon className="h-4 w-4 shrink-0 text-lp-text-tertiary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-lp-text">{doc.title}</p>
        <p className="truncate text-[10px] uppercase tracking-wider text-lp-text-tertiary">
          {DOC_KIND_LABEL[doc.kind]}
          {doc.scope ? ` · ${doc.scope}` : ''}
          {doc.subtitle ? ` · ${doc.subtitle}` : ''}
        </p>
      </div>
      <Link
        href={editHref}
        className="text-xs font-medium text-lp-text-secondary hover:text-lp-text"
      >
        Edit
      </Link>
      {pdfHref && (
        <a
          href={pdfHref}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-lp-orange hover:underline"
        >
          PDF
        </a>
      )}
    </li>
  );
}

function formatRoutingLabel(r: NonNullable<PacketManifest['routing']>): string {
  const date = new Date(`${r.date.slice(0, 10)}T12:00:00Z`);
  const dateLabel = Number.isNaN(date.getTime())
    ? r.date
    : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const where = [r.venue_name, r.city].filter(Boolean).join(', ');
  return where ? `${dateLabel} — ${where}` : dateLabel;
}

function formatViewedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
