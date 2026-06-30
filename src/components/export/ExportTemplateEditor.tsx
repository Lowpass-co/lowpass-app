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
import { createPortal } from 'react-dom';
import { ChevronRight, Eye, EyeOff, GripVertical, Globe, Loader2, Maximize2, Trash2, Upload, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import {
  defaultConfig,
  HEADER_ELEMENT_LABELS,
  normalizeConfig,
  SECTION_LABELS,
  type Align,
  type BudgetScope,
  type ExportSurface,
  type FontFamily,
  type HeaderElementId,
  type PageSize,
  type TemplateConfig,
} from '@/lib/export/template-config';

interface SavedTemplate {
  id: string;
  name: string;
  surface: ExportSurface;
  config: TemplateConfig;
  isDefault: boolean;
  isGlobal: boolean;
}

const PAGE_SIZES: ReadonlyArray<{ value: PageSize; label: string }> = [
  { value: 'A4', label: 'A4' },
  { value: 'Letter', label: 'Letter' },
];

const SCOPES: ReadonlyArray<{ value: BudgetScope; label: string }> = [
  { value: 'both', label: 'Both + Variance' },
  { value: 'projected', label: 'Projected' },
  { value: 'actual', label: 'Actual' },
];

const FONT_FAMILIES: ReadonlyArray<{ value: FontFamily; label: string }> = [
  { value: 'system', label: 'Sans (system)' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Mono' },
];

const LOGO_ALIGNS: ReadonlyArray<{ value: Align; label: string }> = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

/** Printable page widths at 96dpi (CSS px) — drives the preview page boundary so
 *  A4 ↔ Letter reflow is visible. A4 210mm ≈ 794px; Letter 8.5in = 816px. */
const PAGE_PX: Record<PageSize, { w: number; h: number }> = {
  A4: { w: 794, h: 1123 },
  Letter: { w: 816, h: 1056 },
};

const ls = {
  get(key: string): string | null {
    try { return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null; } catch { return null; }
  },
  set(key: string, val: string) {
    try { if (typeof window !== 'undefined') window.localStorage.setItem(key, val); } catch { /* ignore quota/SSR */ }
  },
};

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

  // Preview zoom: null = fit-to-width (default), else an explicit scale.
  const [zoom, setZoom] = useState<number | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [docHeight, setDocHeight] = useState(1123);
  const previewWrapRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // srcDoc is same-origin → measure the rendered doc height so the page sheet
  // shows ALL content (not a clipped fixed height) at the page width.
  const measureDoc = useCallback(() => {
    try {
      const h = iframeRef.current?.contentDocument?.documentElement?.scrollHeight;
      if (h && h > 0) setDocHeight(h);
    } catch { /* cross-origin guard — never throws the editor */ }
  }, []);

  // Dirty tracking — the config JSON as of the last clean point (open / apply /
  // save). Drives the "Save these settings as a template?" prompt on close/export.
  const baselineRef = useRef<string>('');
  const [promptSave, setPromptSave] = useState<null | 'close' | 'download'>(null);
  const [promptName, setPromptName] = useState('');

  const LAST_USED_KEY = `lp-export-last-template:${surface}`;

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

  const [headerDragId, setHeaderDragId] = useState<HeaderElementId | null>(null);
  const toggleHeaderElement = useCallback((id: HeaderElementId) => {
    setConfig((c) => ({
      ...c,
      header: { ...c.header, elements: c.header.elements.map((e) => (e.id === id ? { ...e, show: !e.show } : e)) },
    }));
  }, []);
  const reorderHeader = useCallback((fromId: HeaderElementId, toId: HeaderElementId) => {
    setConfig((c) => {
      if (fromId === toId) return c;
      const arr = [...c.header.elements];
      const from = arr.findIndex((e) => e.id === fromId);
      const to = arr.findIndex((e) => e.id === toId);
      if (from < 0 || to < 0) return c;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return { ...c, header: { ...c.header, elements: arr } };
    });
  }, []);
  // Mutate one general/header/footer field immutably.
  const setGeneral = useCallback(<K extends keyof TemplateConfig['general']>(k: K, v: TemplateConfig['general'][K]) => {
    setConfig((c) => ({ ...c, general: { ...c.general, [k]: v } }));
  }, []);
  const setHeader = useCallback(<K extends keyof TemplateConfig['header']>(k: K, v: TemplateConfig['header'][K]) => {
    setConfig((c) => ({ ...c, header: { ...c.header, [k]: v } }));
  }, []);
  const setFooter = useCallback(<K extends keyof TemplateConfig['footer']>(k: K, v: TemplateConfig['footer'][K]) => {
    setConfig((c) => ({ ...c, footer: { ...c.footer, [k]: v } }));
  }, []);

  // --- Phase 3: saved templates (workspace + global tier) ---
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const appliedDefaultRef = useRef(false);

  // Seed the dirty baseline with the initial config (the no-template case); the
  // template effect overwrites it if a template auto-applies on open.
  if (baselineRef.current === '') baselineRef.current = JSON.stringify(config);

  const refreshTemplates = useCallback(async (applyDefault: boolean) => {
    try {
      const res = await fetch(`/api/export/templates?surface=${surface}`);
      if (!res.ok) return;
      const { templates: list } = (await res.json()) as { templates: SavedTemplate[] };
      setTemplates(list);
      if (applyDefault && !appliedDefaultRef.current) {
        appliedDefaultRef.current = true;
        // Open behaviour: the last-used template for this surface, else the
        // workspace default, else the current (default) config.
        const lastId = ls.get(LAST_USED_KEY);
        const last = lastId ? list.find((t) => t.id === lastId) : undefined;
        const def = list.find((t) => t.isDefault && !t.isGlobal);
        const chosen = last ?? def;
        if (chosen) {
          const cfg = normalizeConfig(surface, chosen.config);
          setConfig(cfg);
          setSelectedTemplateId(chosen.id);
          baselineRef.current = JSON.stringify(cfg);
        }
      }
    } catch {
      /* templates are optional — a fetch failure leaves the editor usable */
    }
  }, [LAST_USED_KEY, surface]);

  useEffect(() => {
    void refreshTemplates(true);
  }, [refreshTemplates]);

  // Apply a template's config into the live editor. Copy-on-apply for global: this
  // only loads config into editor STATE — Save creates a workspace-owned row.
  const applyTemplate = useCallback((t: SavedTemplate) => {
    const cfg = normalizeConfig(surface, t.config);
    setConfig(cfg);
    setSelectedTemplateId(t.id);
    baselineRef.current = JSON.stringify(cfg);
    if (!t.isGlobal) ls.set(LAST_USED_KEY, t.id);
  }, [LAST_USED_KEY, surface]);

  // Core save — returns true on success. Stamps the dirty baseline + last-used so
  // a freshly-saved template is "clean".
  const doSaveTemplate = useCallback(async (rawName: string): Promise<boolean> => {
    const name = rawName.trim();
    if (!name) return false;
    setSavingTemplate(true);
    try {
      const res = await fetch('/api/export/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surface, name, config }),
      });
      if (!res.ok) {
        showToast('Could not save the template', 'error');
        return false;
      }
      const { template } = (await res.json()) as { template?: { id: string } };
      baselineRef.current = JSON.stringify(config);
      if (template?.id) {
        setSelectedTemplateId(template.id);
        ls.set(LAST_USED_KEY, template.id);
      }
      await refreshTemplates(false);
      showToast('Template saved', 'success');
      return true;
    } catch {
      showToast('Could not save the template', 'error');
      return false;
    } finally {
      setSavingTemplate(false);
    }
  }, [LAST_USED_KEY, config, refreshTemplates, showToast, surface]);

  const saveTemplate = useCallback(async () => {
    if (savingTemplate) return;
    const ok = await doSaveTemplate(newTemplateName);
    if (ok) setNewTemplateName('');
  }, [doSaveTemplate, newTemplateName, savingTemplate]);

  const setDefaultTemplate = useCallback(async (id: string) => {
    try {
      const res = await fetch('/api/export/templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isDefault: true }),
      });
      if (!res.ok) { showToast('Could not set the default', 'error'); return; }
      await refreshTemplates(false);
    } catch {
      showToast('Could not set the default', 'error');
    }
  }, [refreshTemplates, showToast]);

  const deleteTemplate = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/export/templates?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) { showToast('Could not delete the template', 'error'); return; }
      await refreshTemplates(false);
    } catch {
      showToast('Could not delete the template', 'error');
    }
  }, [refreshTemplates, showToast]);

  // Upload a header image (background / logo) → the private export-assets bucket;
  // store the returned path in the config (the render resolves it to a data-URI).
  const [uploading, setUploading] = useState<null | 'bgAssetPath' | 'logoAssetPath'>(null);
  const uploadAsset = useCallback(async (field: 'bgAssetPath' | 'logoAssetPath', file: File) => {
    setUploading(field);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/export/assets', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(body.error ?? 'Could not upload the image', 'error');
        return;
      }
      const { path } = (await res.json()) as { path: string };
      setHeader(field, path);
    } catch {
      showToast('Could not upload the image', 'error');
    } finally {
      setUploading(null);
    }
  }, [setHeader, showToast]);

  const doDownload = useCallback(async () => {
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

  // Dirty = the config diverged from the last clean point (open / apply / save).
  const dirty = baselineRef.current !== JSON.stringify(config);

  // Close / download gate on a "Save these settings?" prompt when dirty.
  const requestClose = useCallback(() => {
    if (dirty) { setPromptName(''); setPromptSave('close'); } else onClose();
  }, [dirty, onClose]);
  const requestDownload = useCallback(() => {
    if (dirty) { setPromptName(''); setPromptSave('download'); } else void doDownload();
  }, [dirty, doDownload]);
  const proceedAfterPrompt = useCallback((action: 'close' | 'download') => {
    setPromptSave(null);
    if (action === 'download') void doDownload();
    else onClose();
  }, [doDownload, onClose]);

  // Fit-to-width: scale the page so its width fills the preview pane (recomputed on
  // resize + page-size change). zoom === null → use this fit scale.
  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el) return;
    const compute = () => {
      const avail = el.clientWidth - 32;
      const pageW = PAGE_PX[config.pageSize].w;
      if (avail > 0) setFitScale(Math.max(0.2, Math.min(2, avail / pageW)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [config.pageSize]);

  const scale = zoom ?? fitScale;
  const page = PAGE_PX[config.pageSize];

  const title =
    surface === 'budget' ? 'Export Budget' : surface === 'payroll' ? 'Export Payroll' : surface === 'routing' ? 'Export Routing' : 'Export Rooming list';

  // Portal to <body> so a transformed/positioned app-chrome ancestor (the
  // ProductHeader) can't constrain or bleed through this full-viewport modal.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={requestClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--lp-z-command-palette)' as unknown as number,
        background: 'color-mix(in srgb, var(--lp-bg-deep) 66%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--lp-space-4)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 'min(1100px, 96vw)', height: 'min(820px, 92vh)', display: 'flex', flexDirection: 'column',
          background: 'var(--lp-panel)', border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-lg)',
          boxShadow: 'var(--lp-shadow-lg, 0 12px 32px rgba(0,0,0,0.3))', overflow: 'hidden',
        }}
      >
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--lp-space-4) var(--lp-space-5)', borderBottom: '1px solid var(--lp-border)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--lp-text)' }}>{title}{dirty ? <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--lp-text-tertiary)' }}>• unsaved</span> : null}</h3>
          <button
            type="button" onClick={requestClose} aria-label="Close" className="btn-transition"
            style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--lp-text-tertiary)', padding: 4, borderRadius: 'var(--lp-radius-md)' }}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* body: preview | settings */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* preview */}
          <div style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--lp-bg-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--lp-border)' }}>
              <ZoomBtn onClick={() => setZoom(Math.max(0.25, scale - 0.1))} title="Zoom out"><ZoomOut className="h-4 w-4" aria-hidden /></ZoomBtn>
              <span style={{ fontSize: 11, color: 'var(--lp-text-tertiary)', minWidth: 38, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{Math.round(scale * 100)}%</span>
              <ZoomBtn onClick={() => setZoom(Math.min(2, scale + 0.1))} title="Zoom in"><ZoomIn className="h-4 w-4" aria-hidden /></ZoomBtn>
              <ZoomBtn onClick={() => setZoom(null)} title="Fit to width"><Maximize2 className="h-4 w-4" aria-hidden /></ZoomBtn>
              <span style={{ fontSize: 11, color: 'var(--lp-text-tertiary)', marginLeft: 'auto' }}>{config.pageSize}{zoom === null ? ' · fit' : ''}</span>
              {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'var(--lp-text-tertiary)' }} aria-hidden /> : null}
            </div>
            <div
              ref={previewWrapRef}
              onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(Math.min(2, Math.max(0.25, scale - e.deltaY * 0.0025))); } }}
              onDoubleClick={() => setZoom(zoom === null ? 1 : null)}
              style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 16 }}
            >
              {previewError ? (
                <div style={{ alignSelf: 'center', textAlign: 'center', color: 'var(--lp-text-tertiary)', fontSize: 13 }}>{previewError}</div>
              ) : (
                <div style={{ width: page.w * scale, height: docHeight * scale, flex: '0 0 auto' }}>
                  <div style={{ width: page.w, transform: `scale(${scale})`, transformOrigin: 'top left', boxShadow: '0 2px 24px rgba(0,0,0,0.22)', background: '#fff', borderRadius: 2 }}>
                    <iframe
                      ref={iframeRef}
                      title="Export preview"
                      srcDoc={previewHtml}
                      onLoad={measureDoc}
                      style={{ width: page.w, height: docHeight, border: 0, display: 'block', background: '#fff' }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* settings */}
          <div style={{ width: 320, flex: '0 0 320px', borderLeft: '1px solid var(--lp-border)', overflowY: 'auto', padding: 'var(--lp-space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-5)' }}>
            <AccordionGroup id="templates" label="Templates" defaultOpen>
              {templates.length === 0 ? (
                <p style={{ fontSize: 11, color: 'var(--lp-text-tertiary)' }}>No saved templates yet. Save the current settings below.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {templates.map((t) => (
                    <TemplateRow
                      key={t.id}
                      t={t}
                      selected={selectedTemplateId === t.id}
                      onApply={() => applyTemplate(t)}
                      onSetDefault={() => void setDefaultTemplate(t.id)}
                      onDelete={() => void deleteTemplate(t.id)}
                    />
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text" value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="Save current as…" maxLength={80}
                  onKeyDown={(e) => { if (e.key === 'Enter') void saveTemplate(); }}
                  style={{ flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 12, borderRadius: 'var(--lp-radius-md)', border: '1px solid var(--lp-border)', background: 'transparent', color: 'var(--lp-text)' }}
                />
                <button
                  type="button" onClick={() => void saveTemplate()} disabled={!newTemplateName.trim() || savingTemplate} className="btn-transition"
                  style={{ border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', padding: '6px 10px', fontSize: 12, fontWeight: 600, color: 'var(--lp-text)', background: 'transparent', cursor: newTemplateName.trim() ? 'pointer' : 'default' }}
                >
                  {savingTemplate ? '…' : 'Save'}
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--lp-text-tertiary)' }}>Templates are shared across this workspace’s tours. Applying a Global template copies it in — edit + Save to keep your own.</p>
            </AccordionGroup>

            <AccordionGroup id="sections" label="Sections" defaultOpen>
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
            </AccordionGroup>

            {surface === 'budget' ? (
              <AccordionGroup id="figures" label="Figures" defaultOpen>
                <Segmented options={SCOPES} value={config.scope ?? 'both'} onChange={(v) => setConfig((c) => ({ ...c, scope: v }))} />
              </AccordionGroup>
            ) : null}

            <AccordionGroup id="general" label="General">
              <FieldLabel>Font</FieldLabel>
              <Segmented options={FONT_FAMILIES} value={config.general.fontFamily} onChange={(v) => setGeneral('fontFamily', v)} />
              <Slider label="Font size" value={config.general.fontScale} min={0.85} max={1.2} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setGeneral('fontScale', v)} />
              <Toggle label="Black & white" checked={config.general.monochrome} onChange={(v) => setGeneral('monochrome', v)} />
              <Toggle label="Dashed dividers" checked={config.general.dividers} onChange={(v) => setGeneral('dividers', v)} />
              <Toggle label="Borderless (hide boxes)" checked={config.general.hideBoxes} onChange={(v) => setGeneral('hideBoxes', v)} />
            </AccordionGroup>

            <AccordionGroup id="page" label="Page size">
              <Segmented options={PAGE_SIZES} value={config.pageSize} onChange={(v) => setConfig((c) => ({ ...c, pageSize: v }))} />
            </AccordionGroup>

            <AccordionGroup id="header" label="Header">
              <Toggle label="Show header" checked={config.header.show} onChange={(v) => setHeader('show', v)} />
              <Toggle label="Show logo / initials" checked={config.logo} onChange={(v) => setConfig((c) => ({ ...c, logo: v }))} />
              <FieldLabel>Logo position</FieldLabel>
              <Segmented options={LOGO_ALIGNS} value={config.header.logoAlign === 'right' ? 'right' : 'left'} onChange={(v) => setHeader('logoAlign', v)} />
              <Slider label="Logo height" value={config.header.logoMaxHeight} min={16} max={120} step={2} format={(v) => `${Math.round(v)}px`} onChange={(v) => setHeader('logoMaxHeight', v)} />
              <Slider label="Logo corner radius" value={config.header.logoRadius} min={0} max={40} step={1} format={(v) => `${Math.round(v)}px`} onChange={(v) => setHeader('logoRadius', v)} />
              <ImageField
                label="Header logo (overrides artist logo)"
                set={Boolean(config.header.logoAssetPath)}
                uploading={uploading === 'logoAssetPath'}
                onPick={(f) => void uploadAsset('logoAssetPath', f)}
                onClear={() => setHeader('logoAssetPath', null)}
              />
              <ImageField
                label="Background image (faded)"
                set={Boolean(config.header.bgAssetPath)}
                uploading={uploading === 'bgAssetPath'}
                onPick={(f) => void uploadAsset('bgAssetPath', f)}
                onClear={() => setHeader('bgAssetPath', null)}
              />
              {config.header.bgAssetPath ? (
                <Slider label="Background opacity" value={config.header.bgOpacity} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setHeader('bgOpacity', v)} />
              ) : null}
              <FieldLabel>Elements</FieldLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {config.header.elements.map((e) => (
                  <div
                    key={e.id}
                    draggable
                    onDragStart={() => setHeaderDragId(e.id)}
                    onDragOver={(ev) => { ev.preventDefault(); if (headerDragId && headerDragId !== e.id) reorderHeader(headerDragId, e.id); }}
                    onDragEnd={() => setHeaderDragId(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                      borderRadius: 'var(--lp-radius-md)', border: '1px solid var(--lp-border)',
                      background: headerDragId === e.id ? 'color-mix(in srgb, var(--lp-orange) 8%, transparent)' : 'transparent',
                      cursor: 'grab', opacity: e.show ? 1 : 0.55,
                    }}
                  >
                    <GripVertical className="h-4 w-4" style={{ color: 'var(--lp-text-tertiary)', flex: '0 0 auto' }} aria-hidden />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--lp-text)' }}>{HEADER_ELEMENT_LABELS[e.id]}</span>
                    <button
                      type="button" onClick={() => toggleHeaderElement(e.id)} className="btn-transition"
                      aria-label={e.show ? 'Hide' : 'Show'} aria-pressed={e.show}
                      style={{ border: 0, background: 'transparent', cursor: 'pointer', color: e.show ? 'var(--lp-orange)' : 'var(--lp-text-tertiary)', padding: 2 }}
                    >
                      {e.show ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
                    </button>
                  </div>
                ))}
              </div>
              <Toggle label="Show document title" checked={config.header.showTitle} onChange={(v) => setHeader('showTitle', v)} />
              <Toggle label="Show subtitle" checked={config.header.showSubtitle} onChange={(v) => setHeader('showSubtitle', v)} />
              <Toggle label="Show “Generated” date" checked={config.header.showGenerated} onChange={(v) => setHeader('showGenerated', v)} />
            </AccordionGroup>

            <AccordionGroup id="footer" label="Footer">
              <p style={{ fontSize: 11, color: 'var(--lp-text-tertiary)', marginBottom: 6 }}>The footer is print-only — it appears on the downloaded PDF, not the preview above.</p>
              <Toggle label="Show footer" checked={config.footer.show} onChange={(v) => setFooter('show', v)} />
              <Toggle label="Page numbers" checked={config.footer.pageNumbers} onChange={(v) => setFooter('pageNumbers', v)} />
              <Toggle label="Summary line + mark" checked={config.footer.summaryLine} onChange={(v) => setFooter('summaryLine', v)} />
            </AccordionGroup>
          </div>
        </div>

        {/* footer */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: 'var(--lp-space-4) var(--lp-space-5)', borderTop: '1px solid var(--lp-border)' }}>
          <button
            type="button" onClick={requestClose} disabled={busy} className="btn-transition"
            style={{ border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', padding: '7px 14px', fontSize: 13, color: 'var(--lp-text-secondary)', background: 'transparent', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button" onClick={requestDownload} disabled={busy} className="btn-transition"
            style={{ border: 0, borderRadius: 'var(--lp-radius-md)', padding: '7px 16px', fontSize: 13, fontWeight: 700, color: 'var(--lp-text-inverse)', background: 'var(--lp-orange)', cursor: busy ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {busy ? 'Generating…' : 'Download PDF'}
          </button>
        </div>

        {/* Save-settings prompt — shown on close/export when the config is dirty. */}
        {promptSave ? (
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--lp-bg-deep) 50%, transparent)', borderRadius: 'var(--lp-radius-lg)' }}>
            <div style={{ width: 'min(420px, 90%)', background: 'var(--lp-panel)', border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-lg)', padding: 'var(--lp-space-5)', boxShadow: 'var(--lp-shadow-lg, 0 12px 32px rgba(0,0,0,0.3))' }}>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--lp-text)', marginBottom: 4 }}>Save these settings as a template?</h4>
              <p style={{ fontSize: 12, color: 'var(--lp-text-secondary)', marginBottom: 'var(--lp-space-4)' }}>You’ve changed the export settings. Save them to reuse across this workspace’s tours.</p>
              <input
                type="text" value={promptName} autoFocus onChange={(e) => setPromptName(e.target.value)} placeholder="Template name" maxLength={80}
                onKeyDown={(e) => { if (e.key === 'Enter' && promptName.trim()) void doSaveTemplate(promptName).then((ok) => { if (ok) proceedAfterPrompt(promptSave); }); }}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 'var(--lp-radius-md)', border: '1px solid var(--lp-border)', background: 'transparent', color: 'var(--lp-text)', marginBottom: 'var(--lp-space-4)' }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setPromptSave(null)} className="btn-transition" style={{ border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', padding: '6px 12px', fontSize: 13, color: 'var(--lp-text-secondary)', background: 'transparent', cursor: 'pointer' }}>Cancel</button>
                <button type="button" onClick={() => proceedAfterPrompt(promptSave)} className="btn-transition" style={{ border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', padding: '6px 12px', fontSize: 13, color: 'var(--lp-text)', background: 'transparent', cursor: 'pointer' }}>Don’t save</button>
                <button type="button" onClick={() => void doSaveTemplate(promptName).then((ok) => { if (ok) proceedAfterPrompt(promptSave); })} disabled={!promptName.trim() || savingTemplate} className="btn-transition" style={{ border: 0, borderRadius: 'var(--lp-radius-md)', padding: '6px 14px', fontSize: 13, fontWeight: 700, color: 'var(--lp-text-inverse)', background: 'var(--lp-orange)', cursor: promptName.trim() ? 'pointer' : 'default' }}>{savingTemplate ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

const ACCORDION_KEY = (id: string) => `lp-export-accordion:${id}`;

function AccordionGroup({ id, label, defaultOpen = false, children }: { id: string; label: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState<boolean>(() => {
    const saved = ls.get(ACCORDION_KEY(id));
    return saved === null ? defaultOpen : saved === '1';
  });
  const toggle = () => {
    setOpen((o) => {
      ls.set(ACCORDION_KEY(id), o ? '0' : '1');
      return !o;
    });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: open ? 8 : 0 }}>
      <button
        type="button" onClick={toggle} className="btn-transition"
        aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 6, border: 0, background: 'transparent', cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 'var(--lp-tracking-caps, 0.06em)', color: 'var(--lp-text-tertiary)' }}
      >
        <ChevronRight className="h-3.5 w-3.5" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }} aria-hidden />
        {label}
      </button>
      {open ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div> : null}
    </div>
  );
}

function ZoomBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} title={title} aria-label={title} className="btn-transition"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', background: 'var(--lp-panel)', cursor: 'pointer', color: 'var(--lp-text-secondary)', width: 26, height: 26 }}
    >
      {children}
    </button>
  );
}

function TemplateRow({ t, selected, onApply, onSetDefault, onDelete }: { t: SavedTemplate; selected: boolean; onApply: () => void; onSetDefault: () => void; onDelete: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 'var(--lp-radius-md)',
        border: `1px solid ${selected ? 'var(--lp-orange)' : 'var(--lp-border)'}`,
        background: selected ? 'color-mix(in srgb, var(--lp-orange) 9%, transparent)' : hover ? 'color-mix(in srgb, var(--lp-orange) 4%, transparent)' : 'transparent',
        transform: hover && !selected ? 'translateX(2px)' : 'none',
        transition: 'transform 0.12s ease, background 0.12s ease, border-color 0.12s ease',
      }}
    >
      <button
        type="button" onClick={onApply} className="btn-transition" title="Apply this template"
        style={{ flex: 1, textAlign: 'left', border: 0, background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--lp-text)', fontWeight: selected ? 700 : 500, display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}
      >
        {t.isGlobal ? <Globe className="h-3.5 w-3.5" style={{ color: 'var(--lp-text-tertiary)', flex: '0 0 auto' }} aria-hidden /> : null}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
      </button>
      {!t.isGlobal ? (
        <>
          <button
            type="button" onClick={onSetDefault} className="btn-transition" title={t.isDefault ? 'Workspace default' : 'Set as workspace default'}
            style={{
              border: `1px solid ${t.isDefault ? 'var(--lp-orange)' : 'var(--lp-border)'}`, borderRadius: 'var(--lp-radius-full, 999px)',
              padding: '2px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer',
              color: t.isDefault ? 'var(--lp-text-inverse)' : 'var(--lp-text-tertiary)',
              background: t.isDefault ? 'var(--lp-orange)' : 'transparent',
            }}
          >
            Default
          </button>
          <button type="button" onClick={onDelete} className="btn-transition" title="Delete template" aria-label="Delete" style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--lp-text-tertiary)', padding: 2 }}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </>
      ) : (
        <span style={{ fontSize: 10, color: 'var(--lp-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Global</span>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: 'var(--lp-text-tertiary)', fontWeight: 600 }}>{children}</div>;
}

function ImageField({ label, set, uploading, onPick, onClear }: { label: string; set: boolean; uploading: boolean; onPick: (f: File) => void; onClear: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <FieldLabel>{label}</FieldLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label
          className="btn-transition"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', fontSize: 12, cursor: uploading ? 'default' : 'pointer', borderRadius: 'var(--lp-radius-md)', border: '1px solid var(--lp-border)', color: 'var(--lp-text-secondary)' }}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />}
          {set ? 'Replace' : 'Upload'}
          <input
            type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }}
          />
        </label>
        {set ? (
          <button type="button" onClick={onClear} className="btn-transition" style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--lp-text-tertiary)', textDecoration: 'underline' }}>
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--lp-text)', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Slider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--lp-text-tertiary)' }}>
        <span>{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--lp-orange)' }}
      />
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
