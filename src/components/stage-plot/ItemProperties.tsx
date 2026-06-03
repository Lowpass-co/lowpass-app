/* ============================================
   LOWPASS — <ItemProperties> (§SP3)

   Right-hand properties panel. With an item selected: edit label,
   position, size, rotation, colour tint, lock, and delete. With
   nothing selected: edit stage settings (dimensions, grid,
   toggles, brand colour). Fuller label/grouping/shape-variant
   controls layer in as later §SP3 work.
   ============================================ */
'use client';

import { useEffect, useState } from 'react';
import { getIcon } from '@/lib/stage-plot/icons';
import { octantLabel } from '@/lib/stage-plot/geometry';
import { defaultHeightFt, readExpertDimensions, writeExpertDimensions } from '@/lib/stage-plot/item-dimensions';
import type { Channel, EditorItem, EditorPlot } from '@/lib/stage-plot/editor-types';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)', marginBottom: 8 }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: 72, fontSize: 'var(--lp-text-xs)', padding: '4px 6px', borderRadius: 5,
  border: '1px solid var(--lp-border)', background: 'var(--lp-surface)', color: 'var(--lp-text)', textAlign: 'right',
};

function Num({ value, onChange, step = 0.5, min }: { value: number; onChange: (n: number) => void; step?: number; min?: number }) {
  return (
    <input type="number" value={value} step={step} min={min} style={inputStyle}
      onChange={(e) => { const n = parseFloat(e.target.value); if (!Number.isNaN(n)) onChange(n); }} />
  );
}

export interface ItemPropertiesProps {
  plot: EditorPlot;
  item: EditorItem | null;
  selectedCount?: number;
  channels?: Channel[];
  onUpdateItem: (patch: Partial<EditorItem>) => void;
  onDeleteItem: () => void;
  onUpdatePlot: (patch: Partial<EditorPlot>) => void;
  /** Create a new channel-list row and return its id (§SP4 / #8). */
  onAddChannel?: (label: string) => string;
  /** §SP-FIX-3 — split a composite drum kit into individual pieces. */
  onSplitKit?: () => void;
  /** §SP-FIX-3 — recombine a split kit piece's group into the composite. */
  onCombineKit?: () => void;
}

export function ItemProperties({ plot, item, selectedCount = 0, channels = [], onUpdateItem, onDeleteItem, onUpdatePlot, onAddChannel, onSplitKit, onCombineKit }: ItemPropertiesProps) {
  const [newCh, setNewCh] = useState('');
  // Expert "custom dimensions" gate (§SP-FIX-2). Off by default → items
  // lock to footprint; on → editable W×D×H. Interim home is localStorage
  // (canonical: workspace settings).
  const [expert, setExpert] = useState(false);
  // localStorage is client-only; read after mount to avoid SSR/hydration mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setExpert(readExpertDimensions()), []);
  return (
    <div style={{ height: '100%', overflowY: 'auto', borderLeft: '1px solid var(--lp-border)', background: 'var(--lp-bg)', padding: 14, width: 260 }}>
      {selectedCount > 1 ? (
        <>
          <h3 style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 600, color: 'var(--lp-text)', margin: '0 0 4px' }}>{selectedCount} items selected</h3>
          <p style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)', margin: '0 0 14px' }}>Drag to move them together.</p>
          <Row label="Rotation°"><Num value={0} step={15} onChange={(n) => onUpdateItem({ rotationDeg: n })} /></Row>
          <Row label="Tint">
            <input type="color" defaultValue="#000000" style={{ width: 40, height: 26, border: 'none', background: 'none' }} onChange={(e) => onUpdateItem({ colorTint: e.target.value })} />
          </Row>
          <button type="button" onClick={onDeleteItem} style={{ marginTop: 12, width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--lp-border)', background: 'var(--lp-surface)', color: 'var(--lp-text-secondary)', cursor: 'pointer', fontSize: 'var(--lp-text-xs)' }}>
            Delete {selectedCount} items
          </button>
        </>
      ) : item ? (
        <>
          <h3 style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 600, color: 'var(--lp-text)', margin: '0 0 4px' }}>
            {item.kind === 'text' ? 'Text box' : item.kind === 'arrow' ? 'Arrow' : getIcon(item.iconName)?.label ?? item.iconName}
          </h3>
          <p style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)', margin: '0 0 14px' }}>
            {item.kind === 'text' || item.kind === 'arrow' ? 'Annotation' : 'Item'}
          </p>

          {item.kind === 'text' && (
            <>
              <Row label="Text">
                <input value={item.text ?? ''} placeholder="Text" style={{ ...inputStyle, width: 130, textAlign: 'left' }}
                  onChange={(e) => onUpdateItem({ text: e.target.value })} />
              </Row>
              <Row label="Size (ft)"><Num value={item.fontSizeFt ?? 0.7} step={0.1} min={0.3} onChange={(n) => onUpdateItem({ fontSizeFt: n })} /></Row>
            </>
          )}

          {item.kind !== 'text' && item.kind !== 'arrow' && (
            <Row label="Label">
              <input value={item.label ?? ''} placeholder="—" style={{ ...inputStyle, width: 130, textAlign: 'left' }}
                onChange={(e) => onUpdateItem({ label: e.target.value })} />
            </Row>
          )}

          <Row label="X (ft)"><Num value={item.xFt} onChange={(n) => onUpdateItem({ xFt: n })} /></Row>
          <Row label="Y (ft)"><Num value={item.yFt} onChange={(n) => onUpdateItem({ yFt: n })} /></Row>

          {item.kind !== 'text' && item.kind !== 'arrow' && (
            <>
              {(onSplitKit || onCombineKit) && (
                <Row label="Display as">
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => onCombineKit?.()}
                      disabled={!onCombineKit}
                      style={{ fontSize: 'var(--lp-text-2xs)', padding: '3px 8px', borderRadius: 5, border: '1px solid var(--lp-border)', background: onCombineKit ? 'var(--lp-surface)' : 'var(--lp-surface-hover)', color: 'var(--lp-text-secondary)', cursor: onCombineKit ? 'pointer' : 'default', fontWeight: onCombineKit ? 400 : 600 }}
                    >
                      Composite
                    </button>
                    <button
                      type="button"
                      onClick={() => onSplitKit?.()}
                      disabled={!onSplitKit}
                      style={{ fontSize: 'var(--lp-text-2xs)', padding: '3px 8px', borderRadius: 5, border: '1px solid var(--lp-border)', background: onSplitKit ? 'var(--lp-surface)' : 'var(--lp-surface-hover)', color: 'var(--lp-text-secondary)', cursor: onSplitKit ? 'pointer' : 'default', fontWeight: onSplitKit ? 400 : 600 }}
                    >
                      Individual
                    </button>
                  </div>
                </Row>
              )}
              {(() => {
                // §SP-FIX-2 — items lock to their real-world footprint
                // (no per-item scale). Expert mode reveals a W×D×H override.
                const icon = getIcon(item.iconName);
                const w = item.widthFt ?? icon?.footprint.width_ft ?? 1;
                const d = item.depthFt ?? icon?.footprint.depth_ft ?? 1;
                const h = item.heightFt ?? (icon ? defaultHeightFt(icon.category) : 1);
                if (!expert) {
                  return (
                    <Row label="Size (ft)">
                      <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text)' }}>
                        {w} × {d} <span style={{ color: 'var(--lp-text-tertiary)' }}>· to scale</span>
                      </span>
                    </Row>
                  );
                }
                return (
                  <>
                    <Row label="Width (ft)"><Num value={w} min={0.1} onChange={(n) => onUpdateItem({ widthFt: n })} /></Row>
                    <Row label="Depth (ft)"><Num value={d} min={0.1} onChange={(n) => onUpdateItem({ depthFt: n })} /></Row>
                    <Row label="Height (ft)"><Num value={h} min={0} onChange={(n) => onUpdateItem({ heightFt: n })} /></Row>
                  </>
                );
              })()}
              <Row label="Rotation°"><Num value={item.rotationDeg ?? 0} step={15} onChange={(n) => onUpdateItem({ rotationDeg: n })} /></Row>
              <Row label="Position">
                <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text)', fontFamily: 'var(--font-mono, monospace)' }}>
                  {octantLabel(item.xFt, item.yFt, plot.widthFt, plot.depthFt)}
                </span>
              </Row>
              <Row label="Custom size (expert)">
                <input
                  type="checkbox"
                  checked={expert}
                  onChange={(e) => { setExpert(e.target.checked); writeExpertDimensions(e.target.checked); }}
                  style={{ accentColor: 'var(--lp-orange)' }}
                />
              </Row>
              {channels.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--lp-border)' }}>
                  <div style={{ fontSize: 'var(--lp-text-2xs)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--lp-text-tertiary)', marginBottom: 6 }}>
                    Channels {item.channelRowIds?.length ? `(${item.channelRowIds.length})` : ''}
                  </div>
                  {(item.channelRowIds ?? []).map((cid) => {
                    const c = channels.find((x) => x.id === cid);
                    if (!c) return null;
                    return (
                      <div key={cid} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: c.color || 'var(--lp-border-strong)', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text)' }}>{c.number}. {c.label}</span>
                        <button type="button" aria-label="Unlink" onClick={() => onUpdateItem({ channelRowIds: (item.channelRowIds ?? []).filter((x) => x !== cid) })} style={{ border: 'none', background: 'none', color: 'var(--lp-text-tertiary)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                      </div>
                    );
                  })}
                  {(item.channelRowIds ?? []).length === 0 && <div style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)', marginBottom: 4 }}>None linked.</div>}
                  <select value="" onChange={(e) => { if (e.target.value) onUpdateItem({ channelRowIds: [...(item.channelRowIds ?? []), e.target.value] }); }}
                    style={{ width: '100%', fontSize: 'var(--lp-text-xs)', padding: '4px 6px', borderRadius: 5, border: '1px solid var(--lp-border)', background: 'var(--lp-surface)', color: 'var(--lp-text)', marginTop: 4 }}>
                    <option value="">+ Link existing channel…</option>
                    {channels.filter((c) => !(item.channelRowIds ?? []).includes(c.id)).map((c) => (<option key={c.id} value={c.id}>{c.number}. {c.label}</option>))}
                  </select>
                  {onAddChannel && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <input value={newCh} onChange={(e) => setNewCh(e.target.value)} placeholder="New channel…"
                        onKeyDown={(e) => { if (e.key === 'Enter' && newCh.trim()) { const id = onAddChannel(newCh.trim()); onUpdateItem({ channelRowIds: [...(item.channelRowIds ?? []), id] }); setNewCh(''); } }}
                        style={{ flex: 1, fontSize: 'var(--lp-text-xs)', padding: '4px 6px', borderRadius: 5, border: '1px solid var(--lp-border)', background: 'var(--lp-surface)', color: 'var(--lp-text)' }} />
                      <button type="button" onClick={() => { if (newCh.trim()) { const id = onAddChannel(newCh.trim()); onUpdateItem({ channelRowIds: [...(item.channelRowIds ?? []), id] }); setNewCh(''); } }}
                        style={{ fontSize: 'var(--lp-text-xs)', padding: '4px 8px', borderRadius: 5, border: '1px solid var(--lp-border)', background: 'var(--lp-surface)', color: 'var(--lp-text-secondary)', cursor: 'pointer' }}>Add</button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {item.kind === 'arrow' && (
            <Row label="Thickness"><Num value={item.weight ?? 2} step={0.5} min={0.5} onChange={(n) => onUpdateItem({ weight: n })} /></Row>
          )}
          <Row label={item.kind === 'arrow' ? 'Colour' : 'Tint'}>
            <input type="color" value={item.colorTint ?? '#000000'} style={{ width: 40, height: 26, border: 'none', background: 'none' }}
              onChange={(e) => onUpdateItem({ colorTint: e.target.value })} />
          </Row>
          {item.kind !== 'text' && item.kind !== 'arrow' && (
            <Row label="Locked">
              <input type="checkbox" checked={Boolean(item.locked)} onChange={(e) => onUpdateItem({ locked: e.target.checked })} />
            </Row>
          )}

          <button type="button" onClick={onDeleteItem}
            style={{ marginTop: 12, width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--lp-border)', background: 'var(--lp-surface)', color: 'var(--lp-text-secondary)', cursor: 'pointer', fontSize: 'var(--lp-text-xs)' }}>
            Delete item
          </button>
        </>
      ) : (
        <>
          <h3 style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 600, color: 'var(--lp-text)', margin: '0 0 14px' }}>Stage</h3>
          <Row label="Width (ft)"><Num value={plot.widthFt} step={1} min={4} onChange={(n) => onUpdatePlot({ widthFt: n })} /></Row>
          <Row label="Depth (ft)"><Num value={plot.depthFt} step={1} min={4} onChange={(n) => onUpdatePlot({ depthFt: n })} /></Row>
          <Row label="Grid (ft)"><Num value={plot.gridSizeFt} step={0.5} min={0.5} onChange={(n) => onUpdatePlot({ gridSizeFt: n })} /></Row>
          <Row label="Show grid"><input type="checkbox" checked={plot.showGrid} onChange={(e) => onUpdatePlot({ showGrid: e.target.checked })} /></Row>
          <Row label="Show rulers"><input type="checkbox" checked={plot.showRulers} onChange={(e) => onUpdatePlot({ showRulers: e.target.checked })} /></Row>
          <Row label="Centre line"><input type="checkbox" checked={plot.showCenterLine} onChange={(e) => onUpdatePlot({ showCenterLine: e.target.checked })} /></Row>
          <Row label="DS centre cross"><input type="checkbox" checked={plot.showDsCross} onChange={(e) => onUpdatePlot({ showDsCross: e.target.checked })} /></Row>
          <Row label="Lateral markers"><input type="checkbox" checked={plot.showLateralMarkers} onChange={(e) => onUpdatePlot({ showLateralMarkers: e.target.checked })} /></Row>
          <Row label="Channel overlay"><input type="checkbox" checked={plot.showChannels} onChange={(e) => onUpdatePlot({ showChannels: e.target.checked })} /></Row>
          <Row label="Snap to grid"><input type="checkbox" checked={plot.snap} onChange={(e) => onUpdatePlot({ snap: e.target.checked })} /></Row>
          <Row label="Brand colour">
            <input type="color" value={plot.brandColor} style={{ width: 40, height: 26, border: 'none', background: 'none' }}
              onChange={(e) => onUpdatePlot({ brandColor: e.target.value })} />
          </Row>
          <p style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)', marginTop: 12 }}>
            Select an item to edit its properties.
          </p>
        </>
      )}
    </div>
  );
}
