'use client';

/* ============================================================
   LOWPASS — <RiderPdfImport> (V1-2)

   Upload an existing rider PDF → Claude extracts its structure → the TM reviews
   proposed sections in <ChangeReviewQueue> → accepted sections are created
   through the SAME createSection() path the builder + templates use. Nothing
   auto-writes ("AI drafts, you approve"); metered server-side via withAiUsage.
   ============================================================ */

import { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles, Upload } from 'lucide-react';
import { createSection } from '@/lib/rider-packs/client';
import { makeUniqueSectionKey } from '@/lib/rider-packs/templates';
import { ChangeReviewQueue, type ReviewRow } from '@/components/advance/ChangeReviewQueue';
import type { ResolvedSection } from '@/lib/rider-packs/types';

interface ExtractedSection {
  title: string;
  fields: { label: string; value: string }[];
}

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'section';
}

export function RiderPdfImport({
  packId,
  sections,
  onApplied,
}: {
  packId: string;
  sections: ResolvedSection[];
  onApplied: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposed, setProposed] = useState<ExtractedSection[] | null>(null);

  async function extract() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Choose a rider PDF first.'); return; }
    setBusy(true); setError(null); setProposed(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/rider-packs/${packId}/extract-rider`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Extraction failed'); return; }
      const secs = (data.sections ?? []) as ExtractedSection[];
      if (secs.length === 0) { setError('No sections found in that PDF.'); return; }
      setProposed(secs);
    } finally { setBusy(false); }
  }

  // One review row per proposed section (accept/reject whole sections).
  const rows: ReviewRow[] = (proposed ?? []).map((s, i) => ({
    id: `sec-${i}`,
    label: s.title,
    newValue: `${s.fields.length} field${s.fields.length === 1 ? '' : 's'}${s.fields.length ? `: ${s.fields.slice(0, 4).map((f) => f.label).join(', ')}${s.fields.length > 4 ? '…' : ''}` : ''}`,
  }));

  async function apply(accepted: ReviewRow[]) {
    if (!proposed) return;
    setBusy(true); setError(null);
    try {
      const keys = new Set(sections.map((s) => s.section_key));
      let sortBase = sections.length > 0 ? Math.max(...sections.map((s) => s.sort_order)) + 10 : 10;
      const acceptedIdx = new Set(accepted.map((r) => Number(r.id.replace('sec-', ''))));
      for (let i = 0; i < proposed.length; i++) {
        if (!acceptedIdx.has(i)) continue;
        const sec = proposed[i];
        const key = makeUniqueSectionKey(slug(sec.title), keys);
        keys.add(key);
        await createSection(packId, {
          section_key: key,
          title: sec.title,
          sort_order: sortBase,
          section_type: 'fields',
          fields: sec.fields.map((f, j) => ({ type: 'text', key: `f${j + 1}`, label: f.label, value: f.value })),
        });
        sortBase += 10;
      }
      setProposed(null);
      if (fileRef.current) fileRef.current.value = '';
      await onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add sections');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border" style={{ backgroundColor: 'var(--lp-surface)', borderColor: 'var(--lp-border)' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors hover:bg-lp-surface-hover"
        aria-expanded={open}
        data-testid="rider-import-toggle"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0" style={{ color: 'var(--color-lp-orange)' }} />
          <div>
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Import from PDF</h2>
            <p className="mt-0.5 text-xs text-lp-text-secondary">
              {open ? 'Upload an existing rider — AI proposes sections, you approve.' : 'Collapsed — expand to import a rider PDF.'}
            </p>
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-lp-text-tertiary" /> : <ChevronRight className="h-4 w-4 shrink-0 text-lp-text-tertiary" />}
      </button>

      {open && (
        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--lp-border)', display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-3)' }}>
          {error ? <div role="alert" className="text-xs" style={{ color: 'var(--color-lp-error)' }}>{error}</div> : null}

          {proposed ? (
            <ChangeReviewQueue
              rows={rows}
              sourceLabel={`AI proposed ${rows.length} section${rows.length === 1 ? '' : 's'} from the PDF`}
              applyLabel="Add"
              onApply={(accepted) => void apply(accepted)}
              onCancel={() => setProposed(null)}
            />
          ) : (
            <div className="flex flex-wrap items-center" style={{ gap: 'var(--lp-space-2)' }}>
              <input ref={fileRef} type="file" accept="application/pdf" data-testid="rider-import-file" className="text-xs" style={{ color: 'var(--lp-text-secondary)' }} />
              <button
                type="button"
                onClick={() => void extract()}
                disabled={busy}
                data-testid="rider-import-extract"
                className="btn-transition inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5"
                style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text-inverse, #fff)', background: 'var(--color-lp-orange)', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}
              >
                <Upload size={14} />
                {busy ? 'Reading…' : 'Extract rider'}
              </button>
              <span className="text-[10px] text-lp-text-tertiary">Nothing is added until you approve.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
