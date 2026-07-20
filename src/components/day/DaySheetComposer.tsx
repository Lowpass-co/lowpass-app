'use client';

/* ============================================================
   LOWPASS — <DaySheetComposer> (D1-2 · DAY-03)

   Modal from the Day surface. Pick an audience template (Standard / Crew /
   Driver / Band / Compact) — a preset of section toggles + type scale — tweak
   the section checkboxes, preview, and Download PDF through the SHARED export
   shell (POST /api/day/[routingId]/export/{preview,pdf}). No bespoke PDF chrome.
   ============================================================ */

import { useCallback, useEffect, useState } from 'react';
import {
  defaultConfig,
  applyDaySheetTemplate,
  DAYSHEET_SECTION_IDS,
  DAYSHEET_TEMPLATE_LABELS,
  SECTION_LABELS,
  type TemplateConfig,
  type DaySheetTemplate,
} from '@/lib/export/template-config';

const TEMPLATES: DaySheetTemplate[] = ['standard', 'crew', 'driver', 'band', 'compact'];

export function DaySheetComposer({ routingId, onClose }: { routingId: string; onClose: () => void }) {
  const [config, setConfig] = useState<TemplateConfig>(() => defaultConfig('daysheet'));
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const template = config.daysheet?.template ?? 'standard';

  const refreshPreview = useCallback(
    async (cfg: TemplateConfig) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/day/${routingId}/export/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: cfg }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(typeof data.error === 'string' ? data.error : 'Preview failed');
          setPreviewHtml(null);
          return;
        }
        setPreviewHtml(data.html ?? '');
      } finally {
        setBusy(false);
      }
    },
    [routingId],
  );

  // Initial preview + on every config change (debounced lightly).
  useEffect(() => {
    const t = setTimeout(() => void refreshPreview(config), 200);
    return () => clearTimeout(t);
  }, [config, refreshPreview]);

  const pickTemplate = (t: DaySheetTemplate) => setConfig((c) => applyDaySheetTemplate(c, t));
  const toggleSection = (id: string) =>
    setConfig((c) => ({
      ...c,
      sections: c.sections.map((s) => (s.id === id ? { ...s, show: !s.show } : s)),
    }));

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/day/${routingId}/export/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(typeof j.error === 'string' ? j.error : 'Export failed');
        return;
      }
      const cd = res.headers.get('Content-Disposition') ?? '';
      const name = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/.exec(cd)?.[1] ?? 'Day Sheet.pdf';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = decodeURIComponent(name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(960px, 96vw)', maxHeight: '90vh', display: 'grid', gridTemplateColumns: '300px 1fr', overflow: 'hidden', background: 'var(--lp-panel)', border: '1px solid var(--lp-border-strong)', borderRadius: 'var(--lp-radius-lg)' }}
      >
        {/* Controls */}
        <div style={{ borderRight: '1px solid var(--lp-border)', padding: 'var(--lp-space-4)', overflow: 'auto' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 'var(--lp-text-lg)', fontWeight: 'var(--lp-weight-bold)', color: 'var(--lp-text)' }}>Day sheet</h2>
            <button type="button" onClick={onClose} style={{ border: 0, background: 'transparent', color: 'var(--lp-text-tertiary)', fontSize: 20, cursor: 'pointer' }} aria-label="Close">×</button>
          </div>

          <div className="lp-label-caps" style={{ fontSize: 10, color: 'var(--lp-text-tertiary)', marginBottom: 6 }}>Template</div>
          <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
            {TEMPLATES.map((t) => {
              const active = template === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => pickTemplate(t)}
                  data-testid={`daysheet-template-${t}`}
                  className="btn-transition"
                  style={{
                    textAlign: 'left',
                    padding: '7px 10px',
                    fontSize: 'var(--lp-text-sm)',
                    borderRadius: 'var(--lp-radius-md)',
                    border: `1px solid ${active ? 'var(--color-lp-orange)' : 'var(--lp-border)'}`,
                    background: active ? 'color-mix(in srgb, var(--color-lp-orange) 10%, transparent)' : 'transparent',
                    color: active ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
                    fontWeight: active ? 'var(--lp-weight-semibold)' : 'var(--lp-weight-regular)',
                    cursor: 'pointer',
                  }}
                >
                  {DAYSHEET_TEMPLATE_LABELS[t]}
                </button>
              );
            })}
          </div>

          <div className="lp-label-caps" style={{ fontSize: 10, color: 'var(--lp-text-tertiary)', marginBottom: 6 }}>Sections</div>
          <div style={{ display: 'grid', gap: 4, marginBottom: 16 }}>
            {DAYSHEET_SECTION_IDS.map((id) => {
              const on = config.sections.find((s) => s.id === id)?.show !== false;
              return (
                <label key={id} className="flex items-center" style={{ gap: 8, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={() => toggleSection(id)} data-testid={`daysheet-section-${id}`} />
                  {SECTION_LABELS[id] ?? id}
                </label>
              );
            })}
          </div>

          {error ? <div role="alert" style={{ marginBottom: 10, fontSize: 'var(--lp-text-xs)', color: 'var(--color-lp-error)' }}>{error}</div> : null}

          <button
            type="button"
            onClick={() => void download()}
            disabled={downloading}
            data-testid="daysheet-download-pdf"
            className="btn-transition"
            style={{ width: '100%', padding: '8px 14px', fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text-inverse)', background: 'var(--color-lp-orange)', border: 0, borderRadius: 'var(--lp-radius-md)', cursor: 'pointer' }}
          >
            {downloading ? 'Building…' : 'Download PDF'}
          </button>
        </div>

        {/* Preview */}
        <div style={{ background: 'var(--lp-surface)', overflow: 'auto', position: 'relative' }}>
          {busy ? <div style={{ position: 'absolute', top: 8, right: 12, fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>Rendering…</div> : null}
          <iframe
            title="Day sheet preview"
            srcDoc={previewHtml ?? '<p style="font-family:sans-serif;color:#999;padding:24px">Loading preview…</p>'}
            style={{ width: '100%', height: '90vh', border: 0, background: '#fff' }}
          />
        </div>
      </div>
    </div>
  );
}
