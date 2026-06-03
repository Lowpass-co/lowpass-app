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
import { getIcon, registerCustomIcons, kitLayout } from '@/lib/stage-plot/icons';
import type { IconDescriptor } from '@/lib/stage-plot/icons/types';
import { IconPalette } from '@/components/stage-plot/IconPalette';
import { ItemProperties } from '@/components/stage-plot/ItemProperties';
import { StageCanvas } from '@/components/stage-plot/StageCanvas';
import { buildStagePlotPdfHtml } from '@/lib/stage-plot/pdf-render';
import { DEFAULT_PLOT, extractTitleBarFromItems, type Channel, type EditorItem, type EditorPlot } from '@/lib/stage-plot/editor-types';

const uid = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `i${Date.now()}${Math.round(Math.random() * 1e6)}`;

const toolBtn: React.CSSProperties = {
  fontSize: 'var(--lp-text-xs)',
  padding: '5px 10px',
  borderRadius: 6,
  border: '1px solid var(--lp-border)',
  background: 'var(--lp-surface)',
  color: 'var(--lp-text-secondary)',
  cursor: 'pointer',
};

export interface StagePlotEditorProps {
  initialPlot?: EditorPlot;
  initialItems?: EditorItem[];
  /** Channel-list rows from the paired channel_list pack (§SP4). */
  channels?: Channel[];
  /** Workspace custom / AI icons (§SP10) — registered for getIcon + shown in the palette. */
  initialCustomIcons?: IconDescriptor[];
  onChange?: (plot: EditorPlot, items: EditorItem[]) => void;
  /** Optional header-right slot (export / share buttons). */
  actions?: React.ReactNode;
}

export function StagePlotEditor({ initialPlot, initialItems, channels: initialChannels = [], initialCustomIcons = [], onChange, actions }: StagePlotEditorProps) {
  const [plot, setPlot] = useState<EditorPlot>(initialPlot ?? DEFAULT_PLOT);
  const [items, setItems] = useState<EditorItem[]>(initialItems ?? []);
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [customIcons, setCustomIcons] = useState<IconDescriptor[]>(initialCustomIcons);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Keep getIcon able to resolve customs (canvas / properties / PDF).
  useEffect(() => {
    registerCustomIcons(customIcons);
  }, [customIcons]);

  // A new icon generated from the palette: register + show immediately.
  const onCustomGenerated = useCallback((icon: IconDescriptor) => {
    registerCustomIcons([icon]);
    setCustomIcons((prev) => [icon, ...prev.filter((c) => c.name !== icon.name)]);
  }, []);

  // Create a new channel-list row on the fly (mics often aren't on the
  // plot, so you patch an instrument to channels you add here). Returns
  // the new id so the caller can link it immediately.
  const addChannel = useCallback((label: string): string => {
    const id = uid();
    setChannels((prev) => [...prev, { id, number: prev.length + 1, label, color: null, snakeLabel: null }]);
    return id;
  }, []);

  const selectItem = useCallback((id: string | null, additive?: boolean) => {
    setSelectedIds((prev) => {
      if (id == null) return [];
      if (additive) return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      return [id];
    });
  }, []);

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

  const addItem = useCallback(
    (iconName: string, pos?: { xFt: number; yFt: number }) => {
      const icon = getIcon(iconName);
      const id = uid();
      setItems((prev) => [
        ...prev,
        {
          id,
          iconName,
          xFt: pos?.xFt ?? plot.widthFt / 2,
          yFt: pos?.yFt ?? plot.depthFt / 2,
          rotationDeg: 0,
          widthFt: icon?.footprint.width_ft,
          depthFt: icon?.footprint.depth_ft,
          layer: 'main' as const,
          label: icon?.label,
        },
      ]);
      setSelectedIds([id]);
    },
    [plot.widthFt, plot.depthFt],
  );

  const addText = useCallback(() => {
    const id = uid();
    setItems((prev) => [
      ...prev,
      { id, kind: 'text' as const, iconName: '', xFt: plot.widthFt / 2, yFt: plot.depthFt / 2, text: 'Text', fontSizeFt: 0.7, layer: 'annotations' as const },
    ]);
    setSelectedIds([id]);
  }, [plot.widthFt, plot.depthFt]);

  const addArrow = useCallback(() => {
    const id = uid();
    setItems((prev) => [
      ...prev,
      { id, kind: 'arrow' as const, iconName: '', xFt: plot.widthFt / 2 - 2, yFt: plot.depthFt / 2, x2Ft: plot.widthFt / 2 + 2, y2Ft: plot.depthFt / 2, layer: 'annotations' as const },
    ]);
    setSelectedIds([id]);
  }, [plot.widthFt, plot.depthFt]);

  const updateItem = useCallback((id: string, patch: Partial<EditorItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  // Properties edits apply to every selected item.
  const updateSelected = useCallback(
    (patch: Partial<EditorItem>) => {
      setItems((prev) => prev.map((it) => (selectedIds.includes(it.id) ? { ...it, ...patch } : it)));
    },
    [selectedIds],
  );

  const deleteSelected = useCallback(() => {
    setItems((prev) => prev.filter((it) => !selectedIds.includes(it.id)));
    setSelectedIds([]);
  }, [selectedIds]);

  const duplicateSelected = useCallback(() => {
    setItems((prev) => {
      const clones = prev
        .filter((it) => selectedIds.includes(it.id))
        .map((src) => ({ ...src, id: uid(), xFt: +(src.xFt + 1).toFixed(2), yFt: +(src.yFt + 1).toFixed(2) }));
      if (clones.length) setSelectedIds(clones.map((c) => c.id));
      return [...prev, ...clones];
    });
  }, [selectedIds]);

  // §SP-FIX-3 — split a composite kit into individual pieces at their
  // canonical offsets (rotated with the kit), tagged with a shared group.
  const splitKit = useCallback((item: EditorItem) => {
    const layout = kitLayout(item.iconName);
    if (!layout) return;
    const gid = uid();
    const rad = ((item.rotationDeg ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const pieces: EditorItem[] = layout.pieces.map((p) => {
      const rx = p.dxFt * cos - p.dyFt * sin;
      const ry = p.dxFt * sin + p.dyFt * cos;
      const ic = getIcon(p.iconName);
      return {
        id: uid(),
        iconName: p.iconName,
        xFt: +(item.xFt + rx).toFixed(2),
        yFt: +(item.yFt + ry).toFixed(2),
        rotationDeg: item.rotationDeg ?? 0,
        widthFt: ic?.footprint.width_ft,
        depthFt: ic?.footprint.depth_ft,
        layer: item.layer ?? 'main',
        label: ic?.label,
        groupId: gid,
        kitName: item.iconName,
      };
    });
    setItems((prev) => [...prev.filter((it) => it.id !== item.id), ...pieces]);
    setSelectedIds(pieces.map((p) => p.id));
  }, []);

  // Collapse a split kit back to its composite at the pieces' average centre.
  const combineKit = useCallback((groupId: string, kitName: string) => {
    setItems((prev) => {
      const group = prev.filter((it) => it.groupId === groupId);
      if (!group.length) return prev;
      const cx = group.reduce((s, it) => s + it.xFt, 0) / group.length;
      const cy = group.reduce((s, it) => s + it.yFt, 0) / group.length;
      const ic = getIcon(kitName);
      const id = uid();
      setSelectedIds([id]);
      return [
        ...prev.filter((it) => it.groupId !== groupId),
        { id, iconName: kitName, xFt: +cx.toFixed(2), yFt: +cy.toFixed(2), rotationDeg: group[0].rotationDeg ?? 0, widthFt: ic?.footprint.width_ft, depthFt: ic?.footprint.depth_ft, layer: group[0].layer ?? 'main', label: ic?.label },
      ];
    });
  }, []);

  // §SP-FIX-5 — z-order: render order = array order; reorder a single item.
  const reorderItem = useCallback((id: string, op: 'front' | 'back' | 'forward' | 'backward') => {
    setItems((prev) => {
      const i = prev.findIndex((it) => it.id === id);
      if (i < 0) return prev;
      const arr = [...prev];
      const [it] = arr.splice(i, 1);
      if (op === 'front') arr.push(it);
      else if (op === 'back') arr.unshift(it);
      else if (op === 'forward') arr.splice(Math.min(arr.length, i + 1), 0, it);
      else arr.splice(Math.max(0, i - 1), 0, it);
      return arr;
    });
  }, []);

  // §SP-FIX-5 — rotating a riser rotates the items sitting on it (unless
  // decoupled), around the riser centre — so a tilted riser carries its
  // gear. Non-risers just set their own rotation.
  const setItemRotation = useCallback((id: string, deg: number) => {
    setItems((prev) => {
      const riser = prev.find((it) => it.id === id);
      if (!riser) return prev;
      if (!riser.iconName.startsWith('infra-riser-')) {
        return prev.map((it) => (it.id === id ? { ...it, rotationDeg: deg } : it));
      }
      const delta = deg - (riser.rotationDeg ?? 0);
      if (!delta) return prev.map((it) => (it.id === id ? { ...it, rotationDeg: deg } : it));
      const ic = getIcon(riser.iconName);
      const rw = riser.widthFt ?? ic?.footprint.width_ft ?? 8;
      const rd = riser.depthFt ?? ic?.footprint.depth_ft ?? 8;
      const rrad = -((riser.rotationDeg ?? 0) * Math.PI) / 180;
      const rcos = Math.cos(rrad);
      const rsin = Math.sin(rrad);
      const drad = (delta * Math.PI) / 180;
      const dcos = Math.cos(drad);
      const dsin = Math.sin(drad);
      return prev.map((it) => {
        if (it.id === id) return { ...it, rotationDeg: deg };
        if (it.decoupleRotation || it.iconName?.startsWith('infra-riser-')) return it;
        const dx = it.xFt - riser.xFt;
        const dy = it.yFt - riser.yFt;
        const lx = dx * rcos - dy * rsin;
        const ly = dx * rsin + dy * rcos;
        if (Math.abs(lx) > rw / 2 || Math.abs(ly) > rd / 2) return it; // not on the riser
        return {
          ...it,
          xFt: +(riser.xFt + (dx * dcos - dy * dsin)).toFixed(2),
          yFt: +(riser.yFt + (dx * dsin + dy * dcos)).toFixed(2),
          rotationDeg: (it.rotationDeg ?? 0) + delta,
        };
      });
    });
  }, []);

  // Delete / Backspace removes the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
        e.preventDefault();
        deleteSelected();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && selectedIds.length) {
        e.preventDefault();
        duplicateSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds, deleteSelected, duplicateSelected]);

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

  const selected = selectedIds.length === 1 ? items.find((it) => it.id === selectedIds[0]) ?? null : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--lp-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: '1px solid var(--lp-border)' }}>
        <input
          value={plot.name}
          onChange={(e) => setPlot((p) => ({ ...p, name: e.target.value }))}
          style={{ fontSize: 'var(--lp-text-md)', fontWeight: 600, border: 'none', background: 'transparent', color: 'var(--lp-text)', flex: 1, outline: 'none' }}
        />
        <span style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>{items.length} items</span>
        <button type="button" onClick={addText} style={toolBtn}>+ Text</button>
        <button type="button" onClick={addArrow} style={toolBtn}>+ Arrow</button>
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
      {(plot.subtitle || plot.tmName || plot.tmPhone || plot.tmEmail || plot.versionLabel) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '4px 14px', borderBottom: '1px solid var(--lp-border)', background: 'var(--lp-surface)', fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-secondary)' }}>
          <span>{plot.subtitle}</span>
          <span>
            {[plot.tmName, plot.tmRole, plot.tmPhone, plot.tmEmail].filter(Boolean).join(' · ')}
            {plot.versionLabel ? `  ·  ${plot.versionLabel}` : ''}
          </span>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ width: 240, minWidth: 240 }}>
          <IconPalette onAdd={addItem} customIcons={customIcons} onCustomGenerated={onCustomGenerated} />
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
            showChannels={plot.showChannels}
            snap={plot.snap}
            brandColor={plot.brandColor}
            items={items}
            channels={channels}
            selectedIds={selectedIds}
            onSelectItem={selectItem}
            onUpdateItem={updateItem}
            onDropIcon={(iconName, xFt, yFt) => addItem(iconName, { xFt, yFt })}
            onReorderItem={reorderItem}
            onDeleteItem={(id) => { setItems((prev) => prev.filter((it) => it.id !== id)); setSelectedIds((prev) => prev.filter((x) => x !== id)); }}
          />
        </div>
        <ItemProperties
          plot={plot}
          item={selected}
          selectedCount={selectedIds.length}
          channels={channels}
          onAddChannel={addChannel}
          onUpdateItem={updateSelected}
          onDeleteItem={deleteSelected}
          onUpdatePlot={(patch) => setPlot((p) => ({ ...p, ...patch }))}
          onSplitKit={selected && selected.iconName.startsWith('drum-kit-') ? () => splitKit(selected) : undefined}
          onCombineKit={selected && selected.kitName && selected.groupId ? () => combineKit(selected.groupId!, selected.kitName!) : undefined}
          onReorder={selected ? (op) => reorderItem(selected.id, op) : undefined}
          onRotate={selected ? (deg) => setItemRotation(selected.id, deg) : undefined}
          onExtractTitleBar={() => setPlot((p) => ({ ...p, ...extractTitleBarFromItems(items) }))}
        />
      </div>
    </div>
  );
}
