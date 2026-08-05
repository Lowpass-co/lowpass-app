'use client';

/* ============================================
   LOWPASS — <DocumentVersionControls> (decouple phase B1)

   The version/attach control row for a standalone DOCUMENT (channel_list or
   stage_plot pack), mounted on the tour channel-list surface and above the
   open stage-plot editor. Three controls, one grammar (mirrors
   <LinkedRiderPackControl>'s inline-token styling):

   · Version picker — "which version is this tour's default". Selecting a
     version POSTs a tour attachment (replace-on-attach) and refreshes, so
     the surface re-resolves to the chosen version. Adam's call (B1): picking
     IS attaching — the tour surface always shows the attached document.
   · "Save as version…" — names a deep copy (POST save-version). Deliberately
     does NOT auto-attach: a Saturday variant is usually destined for
     Saturday, not the tour default; the user attaches it where it belongs.
   · "Attach to show…" — routing-row picker (lazy-loaded via
     /api/tours/[id]/routing?lite=1); attaching to a show overrides the tour
     default for that show only (resolution: show → tour → legacy).

   The "Detach" item appears only when the surface says the current document
   reached it via a TOUR attachment — detaching returns the tour to the
   legacy pack-scan fallback.
   ============================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';

interface VersionRow {
  id: string;
  title: string | null;
  version_label: string | null;
  is_root: boolean;
}

interface RoutingLiteRow {
  id: string;
  date: string;
  day_type: string;
  city: string;
  venue_name: string | null;
}

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--lp-text-2xs)',
  fontWeight: 600,
  color: 'var(--lp-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const selectStyle: React.CSSProperties = {
  fontSize: 'var(--lp-text-xs)',
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid var(--lp-border)',
  background: 'var(--lp-surface)',
  color: 'var(--lp-text)',
  maxWidth: 220,
};

const buttonStyle: React.CSSProperties = {
  fontSize: 'var(--lp-text-xs)',
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid var(--lp-border)',
  background: 'transparent',
  color: 'var(--lp-text-secondary)',
  cursor: 'pointer',
};

export function DocumentVersionControls({
  packId,
  tourId,
  kindLabel,
  tourAttachmentId = null,
}: {
  /** The document pack currently shown on this surface. */
  packId: string;
  /** The tour context — target for the default attachment + routing list. */
  tourId: string;
  /** "channel list" / "stage plot" — toasts and titles only. */
  kindLabel: string;
  /** Set when the surface resolved via a TOUR attachment → enables Detach. */
  tourAttachmentId?: string | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState(false);
  const [label, setLabel] = useState('');
  const [routing, setRouting] = useState<RoutingLiteRow[] | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  const loadVersions = useCallback(async () => {
    try {
      const res = await fetch(`/api/rider-packs/${packId}/versions`);
      if (!res.ok) return;
      const j = (await res.json()) as { versions?: VersionRow[] };
      setVersions(j.versions ?? []);
    } catch {
      /* versions are an affordance, not a dependency — surface stays usable */
    }
  }, [packId]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  useEffect(() => {
    if (naming) nameRef.current?.focus();
  }, [naming]);

  const attach = useCallback(
    async (documentPackId: string, target: { tour_id?: string; routing_id?: string }, toast: string) => {
      setBusy(true);
      try {
        const res = await fetch('/api/rider-pack-attachments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document_pack_id: documentPackId, ...target }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(typeof j.error === 'string' ? j.error : `Attach failed (${res.status})`);
        }
        showToast(toast, 'success');
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Attach failed', 'error');
      } finally {
        setBusy(false);
      }
    },
    [router, showToast],
  );

  const saveAsVersion = useCallback(async () => {
    const name = label.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rider-packs/${packId}/save-version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : `Save failed (${res.status})`);
      showToast(`Version "${name}" saved`, 'success');
      setNaming(false);
      setLabel('');
      await loadVersions();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setBusy(false);
    }
  }, [label, loadVersions, packId, showToast]);

  const detach = useCallback(async () => {
    if (!tourAttachmentId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rider-pack-attachments?id=${encodeURIComponent(tourAttachmentId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`Detach failed (${res.status})`);
      showToast(`Tour default ${kindLabel} detached`, 'success');
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Detach failed', 'error');
    } finally {
      setBusy(false);
    }
  }, [kindLabel, router, showToast, tourAttachmentId]);

  const loadRouting = useCallback(async () => {
    if (routing !== null) return;
    try {
      const res = await fetch(`/api/tours/${tourId}/routing?lite=1`);
      if (!res.ok) throw new Error(`${res.status}`);
      const j = (await res.json()) as { routing?: RoutingLiteRow[] };
      setRouting(j.routing ?? []);
    } catch {
      setRouting([]);
    }
  }, [routing, tourId]);

  const versionName = (v: VersionRow) =>
    v.is_root ? `${v.title ?? 'Untitled'} (original)` : v.version_label ?? v.title ?? 'Untitled';

  return (
    <div className="print:hidden" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={labelStyle}>Version</span>
      <select
        value={packId}
        disabled={busy || versions.length === 0}
        onChange={(e) => {
          const next = e.target.value;
          if (next && next !== packId) {
            void attach(next, { tour_id: tourId }, `Tour ${kindLabel} switched`);
          }
        }}
        style={selectStyle}
        title={`Which version is this tour's default ${kindLabel} — picking one attaches it to the tour`}
      >
        {versions.length === 0 ? <option value={packId}>—</option> : null}
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            {versionName(v)}
          </option>
        ))}
      </select>

      {naming ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <input
            ref={nameRef}
            value={label}
            disabled={busy}
            placeholder="e.g. Saturday — with keys"
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveAsVersion();
              if (e.key === 'Escape') { setNaming(false); setLabel(''); }
            }}
            style={{ ...selectStyle, width: 180 }}
          />
          <button type="button" onClick={() => void saveAsVersion()} disabled={busy || !label.trim()} style={buttonStyle}>
            Save
          </button>
          <button type="button" onClick={() => { setNaming(false); setLabel(''); }} disabled={busy} style={buttonStyle}>
            Cancel
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setNaming(true)} disabled={busy} style={buttonStyle}>
          Save as version…
        </button>
      )}

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <select
          value=""
          disabled={busy}
          onFocus={() => void loadRouting()}
          onMouseDown={() => void loadRouting()}
          onChange={(e) => {
            const routingId = e.target.value;
            if (!routingId) return;
            const row = (routing ?? []).find((r) => r.id === routingId);
            const where = row ? `${row.city || row.venue_name || 'show'} · ${row.date}` : 'show';
            void attach(packId, { routing_id: routingId }, `Attached to ${where}`);
            e.target.value = '';
          }}
          style={{ ...selectStyle, maxWidth: 200 }}
          title={`Attach THIS version to one show — that show then overrides the tour default ${kindLabel}`}
        >
          <option value="">Attach to show…</option>
          {(routing ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {`${r.date} · ${r.city || r.venue_name || r.day_type}`}
            </option>
          ))}
        </select>
      </span>

      {tourAttachmentId ? (
        <button
          type="button"
          onClick={() => void detach()}
          disabled={busy}
          title={`Remove the tour-default attachment — the tour falls back to scanning its rider packs for a ${kindLabel}`}
          style={buttonStyle}
        >
          Detach
        </button>
      ) : null}
    </div>
  );
}
