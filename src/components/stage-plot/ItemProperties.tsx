/* ============================================
   LOWPASS — <ItemProperties> (§SP3)

   Right-hand properties panel. With an item selected: edit label,
   position, size, rotation, colour tint, lock, and delete. With
   nothing selected: edit stage settings (dimensions, grid,
   toggles, brand colour). Fuller label/grouping/shape-variant
   controls layer in as later §SP3 work.
   ============================================ */
'use client';

import { getIcon } from '@/lib/stage-plot/icons';
import { octantLabel } from '@/lib/stage-plot/geometry';
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
}

export function ItemProperties({ plot, item, selectedCount = 0, channels = [], onUpdateItem, onDeleteItem, onUpdatePlot }: ItemPropertiesProps) {
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
              <Row label="Scale"><Num value={item.scale ?? 1} step={0.1} min={0.2} onChange={(n) => onUpdateItem({ scale: n })} /></Row>
              <Row label="Width (ft)"><Num value={item.widthFt ?? getIcon(item.iconName)?.footprint.width_ft ?? 1} min={0.1} onChange={(n) => onUpdateItem({ widthFt: n })} /></Row>
              <Row label="Depth (ft)"><Num value={item.depthFt ?? getIcon(item.iconName)?.footprint.depth_ft ?? 1} min={0.1} onChange={(n) => onUpdateItem({ depthFt: n })} /></Row>
              <Row label="Rotation°"><Num value={item.rotationDeg ?? 0} step={15} onChange={(n) => onUpdateItem({ rotationDeg: n })} /></Row>
              <Row label="Position">
                <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text)', fontFamily: 'var(--font-mono, monospace)' }}>
                  {octantLabel(item.xFt, item.yFt, plot.widthFt, plot.depthFt)}
                </span>
              </Row>
              {channels.length > 0 && (
                <Row label="Channel">
                  <select
                    value={item.channelRowId ?? ''}
                    onChange={(e) => onUpdateItem({ channelRowId: e.target.value || null })}
                    style={{ width: 132, fontSize: 'var(--lp-text-xs)', padding: '4px 6px', borderRadius: 5, border: '1px solid var(--lp-border)', background: 'var(--lp-surface)', color: 'var(--lp-text)' }}
                  >
                    <option value="">— None —</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>{c.number}. {c.label}</option>
                    ))}
                  </select>
                </Row>
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
