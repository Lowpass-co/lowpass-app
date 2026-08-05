'use client';

/* ============================================
   LOWPASS — <RiderChannelListAttachSection> (decouple phase B1)

   The rider builder's tech-section body under the ATTACHMENT model. A rider
   no longer OWNS its channel list — it presents an attached document version
   (rider_pack_attachments, target rider_pack_id). Three states:

   1. ATTACHED — read-only preview of the attached document (resolved via
      /api/rider-packs/[docId]/resolved) + "Edit channel list ↗" (deep-link
      to the standalone document editor) + "Change…" (attach a different
      channel-list document in scope; replace-on-attach) + Detach.
   2. NOT ATTACHED, section OWNED — the legacy owned-rows section rendered
      READ-ONLY (the sheet, not the editor) + one-click "Convert to attached
      document": POST convert-section copies JUST this section into a new
      standalone channel_list document (own family root) and attaches it.
      The owned rows stay behind untouched — reversible, and the attachment
      takes precedence here from then on.
   3. NOT ATTACHED, section INHERITED — falls back to `children` (the legacy
      <ChannelListEditor> with its tested override gate). An inherited
      section's rows live on the PARENT pack, so converting it here would
      copy nothing — it converts at the scope that owns it.
   ============================================ */

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { ChannelListTourSheet } from '@/components/channel-list/ChannelListTourSheet';
import { getPackResolved, listPacks } from '@/lib/rider-packs/client';
import type { ResolvedSection, RiderPack } from '@/lib/rider-packs/types';

interface AttachedDoc {
  attachment_id: string;
  document_pack_id: string;
  kind: string;
  title: string;
  version_label: string | null;
}

const buttonClass =
  'rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-xs font-semibold uppercase tracking-wide text-lp-text-secondary hover:bg-lp-surface-hover';

export function RiderChannelListAttachSection({
  riderPackId,
  tourId,
  artistId,
  section,
  onStructureChange,
  children,
}: {
  riderPackId: string;
  tourId: string | null;
  artistId: string | null;
  section: ResolvedSection;
  /** Refresh the parent PackEditor's resolved view after convert/attach. */
  onStructureChange: () => void;
  /** State 3 fallback — the legacy inherited-section editor. */
  children: React.ReactNode;
}) {
  const { showToast } = useToast();
  const [attachments, setAttachments] = useState<AttachedDoc[] | null>(null);
  const [docSection, setDocSection] = useState<ResolvedSection | null>(null);
  const [candidates, setCandidates] = useState<RiderPack[] | null>(null);
  const [busy, setBusy] = useState(false);

  const attachedDoc = (attachments ?? []).find((a) => a.kind === 'channel_list') ?? null;

  const loadAttachments = useCallback(async () => {
    try {
      const res = await fetch(`/api/rider-pack-attachments?rider_pack_id=${encodeURIComponent(riderPackId)}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const j = (await res.json()) as { documents?: AttachedDoc[] };
      setAttachments(j.documents ?? []);
    } catch {
      setAttachments([]); // pre-migration / error → behave as "nothing attached"
    }
  }, [riderPackId]);

  useEffect(() => {
    void loadAttachments();
  }, [loadAttachments]);

  // Resolve the attached document's channel_list section for the preview.
  useEffect(() => {
    let cancelled = false;
    if (!attachedDoc) {
      setDocSection(null);
      return;
    }
    void (async () => {
      try {
        const resolved = await getPackResolved(attachedDoc.document_pack_id);
        const sec = resolved.sections.find((s) => s.section_type === 'channel_list') ?? null;
        if (!cancelled) setDocSection(sec);
      } catch {
        if (!cancelled) setDocSection(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachedDoc?.document_pack_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCandidates = useCallback(async () => {
    if (candidates !== null) return;
    try {
      const [tourPacks, artistPacks] = await Promise.all([
        tourId ? listPacks({ tourId }) : Promise.resolve([] as RiderPack[]),
        artistId ? listPacks({ scope: 'artist', artistId }) : Promise.resolve([] as RiderPack[]),
      ]);
      const seen = new Set<string>();
      const all = [...tourPacks, ...artistPacks].filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return (p as { kind?: string | null }).kind === 'channel_list';
      });
      setCandidates(all);
    } catch {
      setCandidates([]);
    }
  }, [artistId, candidates, tourId]);

  const attach = useCallback(
    async (documentPackId: string) => {
      setBusy(true);
      try {
        const res = await fetch('/api/rider-pack-attachments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document_pack_id: documentPackId, rider_pack_id: riderPackId }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(typeof j.error === 'string' ? j.error : `Attach failed (${res.status})`);
        }
        showToast('Channel list attached', 'success');
        await loadAttachments();
        onStructureChange();
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Attach failed', 'error');
      } finally {
        setBusy(false);
      }
    },
    [loadAttachments, onStructureChange, riderPackId, showToast],
  );

  const detach = useCallback(async () => {
    if (!attachedDoc) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rider-pack-attachments?id=${encodeURIComponent(attachedDoc.attachment_id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`Detach failed (${res.status})`);
      showToast('Channel list detached', 'success');
      await loadAttachments();
      onStructureChange();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Detach failed', 'error');
    } finally {
      setBusy(false);
    }
  }, [attachedDoc, loadAttachments, onStructureChange, showToast]);

  const convert = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/rider-packs/${riderPackId}/convert-section`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section_id: section.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : `Convert failed (${res.status})`);
      showToast('Converted to a standalone channel-list document', 'success');
      await loadAttachments();
      onStructureChange();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Convert failed', 'error');
    } finally {
      setBusy(false);
    }
  }, [loadAttachments, onStructureChange, riderPackId, section.id, showToast]);

  if (attachments === null) {
    return <div className="p-4 text-sm text-lp-text-secondary">Loading channel list…</div>;
  }

  /* ── 1 · attached document ─────────────────────────────────────────────── */
  if (attachedDoc) {
    return (
      <div className="space-y-3 p-2 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-lp-text-secondary">
            Attached document:{' '}
            <span className="font-semibold text-lp-text">
              {attachedDoc.version_label ? `${attachedDoc.title}` : attachedDoc.title}
            </span>
            <span className="ml-2 rounded border border-lp-border px-1 font-mono text-[9px] uppercase leading-4 text-lp-text-tertiary">
              doc
            </span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value=""
              disabled={busy}
              onFocus={() => void loadCandidates()}
              onMouseDown={() => void loadCandidates()}
              onChange={(e) => {
                if (e.target.value) void attach(e.target.value);
                e.target.value = '';
              }}
              className="rounded-lg border border-lp-border bg-lp-surface px-2 py-2 text-xs text-lp-text"
              title="Attach a different channel-list document (replaces this one on the rider)"
            >
              <option value="">Change…</option>
              {(candidates ?? [])
                .filter((c) => c.id !== attachedDoc.document_pack_id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title || 'Untitled'}
                  </option>
                ))}
            </select>
            <button type="button" onClick={() => void detach()} disabled={busy} className={buttonClass}>
              Detach
            </button>
          </div>
        </div>
        {docSection ? (
          <ChannelListTourSheet
            tourId={tourId ?? riderPackId}
            packId={attachedDoc.document_pack_id}
            section={docSection}
            editHref={`/rider-packs/${attachedDoc.document_pack_id}`}
          />
        ) : (
          <p className="rounded-lg border border-dashed border-lp-border px-4 py-6 text-center text-sm text-lp-text-secondary">
            Loading the attached channel list…
          </p>
        )}
      </div>
    );
  }

  /* ── 3 · inherited legacy section → the tested override flow ───────────── */
  if (section.inherited_from) {
    return <>{children}</>;
  }

  /* ── 2 · owned legacy section → read-only + convert ────────────────────── */
  return (
    <div className="space-y-3 p-2 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-lp-border bg-lp-surface px-3 py-2">
        <p className="text-xs text-lp-text-secondary">
          This channel list lives INSIDE the rider (legacy). Convert it to a standalone document to
          name versions and attach it to shows — the rows below stay untouched.
        </p>
        <button
          type="button"
          onClick={() => void convert()}
          disabled={busy}
          className="rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-xs font-semibold uppercase tracking-wide text-lp-orange hover:bg-lp-orange-subtle"
        >
          {busy ? 'Converting…' : 'Convert to attached document'}
        </button>
      </div>
      <ChannelListTourSheet
        tourId={tourId ?? riderPackId}
        packId={riderPackId}
        section={section}
        /* No edit link: this state's edit path IS the convert button above —
           a link back to this same rider's editor would be circular. */
        editHref={null}
      />
    </div>
  );
}
