/* ============================================
   LOWPASS — <StagePlotEditor> (§SP2b/§SP3)

   Three-pane editor: icon palette (left) · stage canvas (centre)
   · properties (right). Owns the in-memory plot + items; emits
   onChange so a host can persist (localStorage in the dev
   harness, API in production). Add from palette, click to select,
   drag to move (snap), edit/delete in the properties panel.
   ============================================ */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getIcon } from '@/lib/stage-plot/icons';
import { IconPalette } from '@/components/stage-plot/IconPalette';
import { ItemProperties } from '@/components/stage-plot/ItemProperties';
import { StageCanvas } from '@/components/stage-plot/StageCanvas';
import { buildStagePlotPdfHtml } from '@/lib/stage-plot/pdf-render';
import { DEFAULT_PLOT, type EditorItem, type EditorPlot } from '@/lib/stage-plot/editor-types';

const uid = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `i${Date.now()}${Math.round(Math.random() * 1e6)}`;

export interface StagePlotEditorProps {
  initialPlot?: EditorPlot;
  initialItems?: EditorItem[];
  onChange?: (plot: EditorPlot, items: EditorItem[]) => void;
  /** Optional header-right slot (export / share buttons). */
  actions?: React.ReactNode;
}

export function StagePlotEditor({ initialPlot, initialItems, onChange, actions }: StagePlotEditorProps) {
  const [plot, setPlot] = useState<EditorPlot>(initialPlot ?? DEFAULT_PLOT);
  const [items, setItems] = useState<EditorItem[]>(initialItems ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Emit changes (debounced) for the host to persist. Keep the
  // latest callback in a ref (updated in an effect, not render).
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    const t = setTimeout(() => onChangeRef.current?.(plot, items), 400);
    return () => clearTimeout(t);
  }, [plot, items]);

  const addItem = useCallback((iconName: string) => {
    const icon = getIcon(iconName);
    setItems((prev) => {
      const id = uid();
      setSelectedId(id);
      return [
        ...prev,
        { id, iconName, xFt: plot.widthFt / 2, yFt: plot.depthFt / 2, rotationDeg: 0, layer: 'main' as const, label: icon?.label },
      ];
    });
  }, [plot.widthFt, plot.depthFt]);

  const moveItem = useCallback((id: string, xFt: number, yFt: number) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, xFt, yFt } : it)));
  }, []);

  const updateSelected = useCallback((patch: Partial<EditorItem>) => {
    setItems((prev) => prev.map((it) => (it.id === selectedId ? { ...it, ...patch } : it)));
  }, [selectedId]);

  const deleteSelected = useCallback(() => {
    setItems((prev) => prev.filter((it) => it.id !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

  const duplicateSelected = useCallback(() => {
    setItems((prev) => {
      const src = prev.find((it) => it.id === selectedId);
      if (!src) return prev;
      const id = uid();
      setSelectedId(id);
      return [...prev, { ...src, id, xFt: +(src.xFt + 1).toFixed(2), yFt: +(src.yFt + 1).toFixed(2) }];
    });
  }, [selectedId]);

  // Delete / Backspace removes the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        deleteSelected();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && selectedId) {
        e.preventDefault();
        duplicateSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, deleteSelected, duplicateSelected]);

  const [exporting, setExporting] = useState(false);
  // Client-side print → "Save as PDF" (env-free, works everywhere).
  // The server Puppeteer route (pdfEndpoint) renders the same HTML
  // for automated / branded exports in production.
  const exportPdf = useCallback(() => {
    setExporting(true);
    try {
      const html = buildStagePlotPdfHtml(plot, items, {
        title: plot.name,
        timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
      });
      const w = window.open('', '_blank');
      if (!w) {
        alert('Allow popups to export.');
        return;
      }
      w.document.write(html);
      w.document.close();
      w.onload = () => {
        w.focus();
        w.print();
      };
    } finally {
      setExporting(false);
    }
  }, [plot, items]);

  const selected = items.find((it) => it.id === selectedId) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--lp-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: '1px solid var(--lp-border)' }}>
        <input
          value={plot.name}
          onChange={(e) => setPlot((p) => ({ ...p, name: e.target.value }))}
          style={{ fontSize: 'var(--lp-text-md)', fontWeight: 600, border: 'none', background: 'transparent', color: 'var(--lp-text)', flex: 1, outline: 'none' }}
        />
        <span style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>{items.length} items</span>
        <button
          type="button"
          onClick={exportPdf}
          disabled={exporting}
          style={{ fontSize: 'var(--lp-text-xs)', padding: '5px 12px', borderRadius: 6, border: '1px solid var(--lp-border)', background: 'var(--lp-surface)', color: 'var(--lp-text)', cursor: exporting ? 'default' : 'pointer' }}
        >
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>
        {actions}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ width: 240, minWidth: 240 }}>
          <IconPalette onAdd={addItem} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <StageCanvas
            widthFt={plot.widthFt}
            depthFt={plot.depthFt}
            gridSizeFt={plot.gridSizeFt}
            showGrid={plot.showGrid}
            showRulers={plot.showRulers}
            showCenterLine={plot.showCenterLine}
            showDsCross={plot.showDsCross}
            showLateralMarkers={plot.showLateralMarkers}
            snap={plot.snap}
            brandColor={plot.brandColor}
            items={items}
            selectedId={selectedId}
            onSelectItem={setSelectedId}
            onMoveItem={moveItem}
          />
        </div>
        <ItemProperties
          plot={plot}
          item={selected}
          onUpdateItem={updateSelected}
          onDeleteItem={deleteSelected}
          onUpdatePlot={(patch) => setPlot((p) => ({ ...p, ...patch }))}
        />
      </div>
    </div>
  );
}
