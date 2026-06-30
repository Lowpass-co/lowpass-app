'use client';

/* ============================================
   LOWPASS — <ExportTemplateEditor> (#8 Document Export, Template Builder P1)

   The wide editor surface that replaces the tiny ExportDialog: left = a LIVE
   preview (an <iframe srcDoc> of the SAME server-built HTML the PDF route prints —
   WYSIWYG by construction), right = the settings panel (section show/hide +
   drag-reorder, page size, logo, budget scope). "Download PDF" POSTs the live
   TemplateConfig to the export/pdf route and downloads the stream.

   Generic over `surface` ('budget' | 'rooming') so Payroll/Routing adopt it with
   no rework. Config is per-export in P1 (no persistence — that's Phase 3). The
   config is PRESENTATION-ONLY; the numbers always come from the server builder.
   ============================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, GripVertical, Loader2, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import {
  defaultConfig,
  SECTION_LABELS,
  type BudgetScope,
  type ExportSurface,
  type PageSize,
  type TemplateConfig,
} from '@/lib/export/template-config';

const PAGE_SIZES: ReadonlyArray<{ value: PageSize; label: string }> = [
  { value: 'A4', label: 'A4' },
  { value: 'Letter', label: 'Letter' },
];

const SCOPES: ReadonlyArray<{ value: BudgetScope; label: string }> = [
  { value: 'both', label: 'Both + Variance' },
  { value: 'projected', label: 'Projected' },
  { value: 'actual', label: 'Actual' },
];

export interface ExportTemplateEditorProps {
  surface: ExportSurface;
  tourId: string;
  /** Budget only — the historical version being viewed (matches on-screen baseline). */
  versionId?: string | null;
  /** Budget only — initial scope (e.g. from a prior dialog default). */
  initialScope?: BudgetScope;
  onClose: () => void;
}

export function ExportTemplateEditor({ surface, tourId, versionId = null, initialScope, onClose }: ExportTemplateEditorProps) {
  const { showToast } = useToast();

  const [config, setConfig] = useState<TemplateConfig>(() => {
    const c = defaultConfig(surface);
    if (surface === 'budget' && initialScope) c.scope = initialScope;
    return c;
  });

  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [previewing, setPreviewing] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const base = `/api/${surface}/${encodeURIComponent(tourId)}/export`;

  // Debounced live preview — POST the live config, render the returned HTML into
  // the iframe. The server builder is the SAME one the PDF route uses → WYSIWYG.
  const reqId = useRef(0);
  useEffect(() => {
    const id = ++reqId.current;
    const t = setTimeout(() => {
      void (async () => {
        setPreviewing(true);
        try {
          const res = await fetch(`${base}/preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config, versionId }),
          });
          if (id !== reqId.current) return; // a newer request superseded this one
          if (!res.ok) {
            setPreviewError(res.status === 404 ? 'Tour not found' : 'Could not render the preview');
            setPreviewing(false);
            return;
          }
          const { html } = (await res.json()) as { html: string };
          if (id !== reqId.current) return;
          setPreviewHtml(html);
          setPreviewError(null);
          setPreviewing(false);
        } catch {
          if (id !== reqId.current) return;
          setPreviewError('Could not render the preview');
          setPreviewing(false);
        }
      })();
    }, 300);
    return () => clearTimeout(t);
  }, [base, config, versionId]);

  const toggleSection = useCallback((sectionId: string) => {
    setConfig((c) => ({ ...c, sections: c.sections.map((s) => (s.id === sectionId ? { ...s, show: !s.show } : s)) }));
  }, []);

  const reorder = useCallback((fromId: string, toId: string) => {
    setConfig((c) => {
      if (fromId === toId) return c;
      const arr = [...c.sections];
      const from = arr.findIndex((s) => s.id === fromId);
      const to = arr.findIndex((s) => s.id === toId);
      if (from < 0 || to < 0) return c;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return { ...c, sections: arr };
    });
  }, []);

  const download = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, versionId }),
      });
      if (!res.ok) {
        showToast(res.status === 404 ? 'Tour not found' : 'Could not generate the PDF', 'error');
        setBusy(false);
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') ?? '';
      const name = /filename="(.+?)"/.exec(cd)?.[1] ?? `${surface}.pdf`;
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      onClose();
    } catch {
      showToast('Could not generate the PDF', 'error');
      setBusy(false);
    }
  }, [base, busy, config, onClose, showToast, surface, versionId]);

  const title = surface === 'budget' ? 'Export Budget' : 'Export Rooming list';

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--lp-z-command-palette)' as unknown as number,
        background: 'color-mix(in srgb, var(--lp-bg-deep) 60%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--lp-space-4)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(1100px, 96vw)', height: 'min(820px, 92vh)', display: 'flex', flexDirection: 'column',
          background: 'var(--lp-panel)', border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-lg)',
          boxShadow: 'var(--lp-shadow-lg, 0 12px 32px rgba(0,0,0,0.3))', overflow: 'hidden',
        }}
      >
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--lp-space-4) var(--lp-space-5)', borderBottom: '1px solid var(--lp-border)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--lp-text)' }}>{title}</h3>
          <button
            type="button" onClick={onClose} aria-label="Close" className="btn-transition"
            style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--lp-text-tertiary)', padding: 4, borderRadius: 'var(--lp-radius-md)' }}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* body: preview | settings */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* preview */}
          <div style={{ flex: 1, minWidth: 0, position: 'relative', background: 'var(--lp-bg-subtle)', display: 'flex', alignItems: 'stretch', justifyContent: 'center', padding: 'var(--lp-space-4)' }}>
            {previewError ? (
              <div style={{ alignSelf: 'center', textAlign: 'center', color: 'var(--lp-text-tertiary)', fontSize: 13 }}>{previewError}</div>
            ) : (
              <iframe
                title="Export preview"
                srcDoc={previewHtml}
                style={{ width: '100%', height: '100%', border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', background: '#fff' }}
              />
            )}
            {previewing ? (
              <div style={{ position: 'absolute', top: 'var(--lp-space-4)', right: 'var(--lp-space-4)', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--lp-text-tertiary)', background: 'var(--lp-panel)', padding: '3px 8px', borderRadius: 'var(--lp-radius-full, 999px)', border: '1px solid var(--lp-border)' }}>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Updating…
              </div>
            ) : null}
          </div>

          {/* settings */}
          <div style={{ width: 320, flex: '0 0 320px', borderLeft: '1px solid var(--lp-border)', overflowY: 'auto', padding: 'var(--lp-space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-5)' }}>
            <Group label="Sections">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {config.sections.map((s) => (
                  <div
                    key={s.id}
                    draggable
                    onDragStart={() => setDragId(s.id)}
                    onDragOver={(e) => { e.preventDefault(); if (dragId && dragId !== s.id) reorder(dragId, s.id); }}
                    onDragEnd={() => setDragId(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px',
                      borderRadius: 'var(--lp-radius-md)', border: '1px solid var(--lp-border)',
                      background: dragId === s.id ? 'color-mix(in srgb, var(--lp-orange) 8%, transparent)' : 'var(--lp-surface, transparent)',
                      cursor: 'grab', opacity: s.show ? 1 : 0.55,
                    }}
                  >
                    <GripVertical className="h-4 w-4" style={{ color: 'var(--lp-text-tertiary)', flex: '0 0 auto' }} aria-hidden />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--lp-text)' }}>{SECTION_LABELS[s.id] ?? s.id}</span>
                    <button
                      type="button" onClick={() => toggleSection(s.id)} className="btn-transition"
                      aria-label={s.show ? 'Hide section' : 'Show section'} aria-pressed={s.show}
                      style={{ border: 0, background: 'transparent', cursor: 'pointer', color: s.show ? 'var(--lp-orange)' : 'var(--lp-text-tertiary)', padding: 2 }}
                    >
                      {s.show ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
                    </button>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: 'var(--lp-text-tertiary)', marginTop: 6 }}>Drag to reorder · eye to show/hide.</p>
            </Group>

            {surface === 'budget' ? (
              <Group label="Figures">
                <Segmented options={SCOPES} value={config.scope ?? 'both'} onChange={(v) => setConfig((c) => ({ ...c, scope: v }))} />
              </Group>
            ) : null}

            <Group label="Page size">
              <Segmented options={PAGE_SIZES} value={config.pageSize} onChange={(v) => setConfig((c) => ({ ...c, pageSize: v }))} />
            </Group>

            <Group label="Letterhead">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--lp-text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={config.logo} onChange={(e) => setConfig((c) => ({ ...c, logo: e.target.checked }))} />
                Show artist logo / initials
              </label>
            </Group>
          </div>
        </div>

        {/* footer */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: 'var(--lp-space-4) var(--lp-space-5)', borderTop: '1px solid var(--lp-border)' }}>
          <button
            type="button" onClick={onClose} disabled={busy} className="btn-transition"
            style={{ border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', padding: '7px 14px', fontSize: 13, color: 'var(--lp-text-secondary)', background: 'transparent', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button" onClick={() => void download()} disabled={busy} className="btn-transition"
            style={{ border: 0, borderRadius: 'var(--lp-radius-md)', padding: '7px 16px', fontSize: 13, fontWeight: 700, color: 'var(--lp-text-inverse)', background: 'var(--lp-orange)', cursor: busy ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {busy ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 'var(--lp-tracking-caps, 0.06em)', color: 'var(--lp-text-tertiary)', marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({ options, value, onChange }: { options: ReadonlyArray<{ value: T; label: string }>; value: T; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value} type="button" onClick={() => onChange(o.value)} className="btn-transition"
            style={{
              textAlign: 'left', padding: '8px 10px', fontSize: 13, cursor: 'pointer',
              borderRadius: 'var(--lp-radius-md)', border: `1px solid ${on ? 'var(--lp-orange)' : 'var(--lp-border)'}`,
              background: on ? 'color-mix(in srgb, var(--lp-orange) 8%, transparent)' : 'transparent',
              color: 'var(--lp-text)', fontWeight: on ? 700 : 500,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
