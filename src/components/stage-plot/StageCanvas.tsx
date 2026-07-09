/* ============================================
   LOWPASS — <StageCanvas> (§SP2 + annotations + multi-select)

   SVG stage surface: dotted grid (faint sub-foot + bold foot),
   stage rect, edge rulers, cardinals, AUDIENCE, reference
   markers, and items (icons, text boxes, arrows) at footprint
   scale. Pan + wheel zoom. Interactive: drop icons from the
   palette, click / shift-click to select (multi), drag to move
   the whole selection, drag the corner handle to resize, drag
   arrow endpoints, single-click a selected text box (or
   double-click any) to edit inline.
   Pure SVG so the same DOM exports to PDF (§SP7).
   ============================================ */
'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { getCategory, getIcon } from '@/lib/stage-plot/icons';
import { ICON_BRAND_TINT_PCT } from '@/lib/stage-plot/icons/types';
import { DEFAULT_VIEW, ft, fitView, snapToGrid, zoomAt, type ViewTransform } from '@/lib/stage-plot/geometry';
import type { Channel, EditorItem } from '@/lib/stage-plot/editor-types';

// VIS-SP-02 — neutral brand default (was #FF4500 orange). Orange = selection only.
const DEFAULT_BRAND = '#6B7280';
export type CanvasItem = EditorItem;

export type LabelPosition = 'top' | 'bottom' | 'left' | 'right' | 'inside' | 'hidden';

/** §SP-FIX-4 — item name label: pill background (8% tint) + scalable
 *  text, placed around the item. Rendered UNROTATED for readability. */
function ItemLabel({ cx, cy, halfW, halfH, text, px, position, heavy }: {
  cx: number; cy: number; halfW: number; halfH: number; text: string; px: number;
  position: Exclude<LabelPosition, 'hidden'>; heavy?: boolean;
}) {
  const gap = 4;
  const pw = text.length * px * 0.58 + px * 0.9;
  const ph = px * 1.5;
  let lx = cx;
  let ly = cy;
  if (position === 'bottom') ly = cy + halfH + gap + ph / 2;
  else if (position === 'top') ly = cy - halfH - gap - ph / 2;
  else if (position === 'left') lx = cx - halfW - gap - pw / 2;
  else if (position === 'right') lx = cx + halfW + gap + pw / 2;
  return (
    <g pointerEvents="none">
      <rect x={lx - pw / 2} y={ly - ph / 2} width={pw} height={ph} rx={ph / 2} fill="color-mix(in srgb, var(--lp-text) 8%, transparent)" />
      <text x={lx} y={ly} fontSize={px} fill="var(--lp-text)" textAnchor="middle" dominantBaseline="central" fontWeight={heavy ? 600 : 500}>{text}</text>
    </g>
  );
}

export interface StageCanvasProps {
  widthFt: number;
  depthFt: number;
  gridSizeFt?: number;
  showGrid?: boolean;
  showRulers?: boolean;
  showCenterLine?: boolean;
  showDsCross?: boolean;
  showLateralMarkers?: boolean;
  showChannels?: boolean;
  snap?: boolean;
  items: EditorItem[];
  channels?: Channel[];
  brandColor?: string;
  selectedIds?: string[];
  onSelectItem?: (id: string | null, additive?: boolean) => void;
  onUpdateItem?: (id: string, patch: Partial<EditorItem>) => void;
  onDropIcon?: (iconName: string, xFt: number, yFt: number) => void;
  /** §SP-FIX-5 — right-click z-order actions. */
  onReorderItem?: (id: string, op: 'front' | 'back' | 'forward' | 'backward') => void;
  onDeleteItem?: (id: string) => void;
  className?: string;
}

type MoveSet = { id: string; ox: number; oy: number; ox2?: number; oy2?: number };
type Drag =
  | { mode: 'move'; set: MoveSet[]; sx: number; sy: number; downId: string; downWasSel: boolean; moved: boolean }
  | { mode: 'resize'; id: string; cx: number; cy: number; startDist: number; startScale: number }
  | { mode: 'arrow'; id: string; end: 'a' | 'b' };

export function StageCanvas({
  widthFt,
  depthFt,
  gridSizeFt = 1,
  showGrid = true,
  showRulers = true,
  showCenterLine = false,
  showDsCross = false,
  showLateralMarkers = false,
  showChannels = false,
  snap = true,
  items,
  channels = [],
  brandColor = DEFAULT_BRAND,
  selectedIds = [],
  onSelectItem,
  onUpdateItem,
  onDropIcon,
  onReorderItem,
  onDeleteItem,
  className,
}: StageCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<ViewTransform>(DEFAULT_VIEW);
  const [panning, setPanning] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const fitted = useRef(false);
  const pan = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const interactive = Boolean(onUpdateItem || onSelectItem);
  const selSet = new Set(selectedIds);

  // §SP-FIX-5 — right-click an item → z-order / delete menu.
  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!interactive) return;
      const itemEl = (e.target as Element).closest('[data-canvas-item]');
      if (!itemEl) return;
      e.preventDefault();
      const id = itemEl.getAttribute('data-canvas-item')!;
      const rect = (e.currentTarget as Element).getBoundingClientRect();
      onSelectItem?.(id, false);
      setCtxMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, id });
    },
    [interactive, onSelectItem],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize({ w: width, h: height });
      if (!fitted.current && width > 0 && height > 0) {
        setView(fitView(width, height, widthFt, depthFt));
        fitted.current = true;
      }
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [widthFt, depthFt]);

  const toFt = useCallback(
    (clientX: number, clientY: number) => {
      const rect = hostRef.current?.getBoundingClientRect();
      const px = (clientX - (rect?.left ?? 0) - view.panX) / view.zoom;
      const py = (clientY - (rect?.top ?? 0) - view.panY) / view.zoom;
      return { xFt: px / ft(1), yFt: py / ft(1) };
    },
    [view],
  );

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView((v) => zoomAt(v, factor, e.clientX - rect.left, e.clientY - rect.top));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      setCtxMenu(null);
      const el = e.target as Element;
      (e.currentTarget as Element).setPointerCapture(e.pointerId);

      const resizeEl = el.closest('[data-resize]');
      if (resizeEl && interactive) {
        const id = resizeEl.getAttribute('data-resize')!;
        const it = items.find((i) => i.id === id);
        if (it) {
          const c = toFt(e.clientX, e.clientY);
          const dist = Math.hypot(c.xFt - it.xFt, c.yFt - it.yFt) || 0.01;
          drag.current = { mode: 'resize', id, cx: it.xFt, cy: it.yFt, startDist: dist, startScale: it.scale ?? 1 };
        }
        return;
      }
      const arrowEnd = el.closest('[data-arrow-end]');
      if (arrowEnd && interactive) {
        const [id, end] = arrowEnd.getAttribute('data-arrow-end')!.split(':') as [string, 'a' | 'b'];
        drag.current = { mode: 'arrow', id, end };
        return;
      }
      const itemEl = el.closest('[data-canvas-item]');
      if (itemEl && interactive) {
        const id = itemEl.getAttribute('data-canvas-item')!;
        const additive = e.shiftKey || e.metaKey || e.ctrlKey;
        const wasSel = selectedIds.includes(id);
        if (additive) {
          onSelectItem?.(id, true);
          return;
        }
        if (!wasSel) onSelectItem?.(id, false);
        const dragIds = wasSel ? selectedIds : [id];
        const set: MoveSet[] = dragIds
          .map((d) => items.find((i) => i.id === d))
          .filter((i): i is EditorItem => Boolean(i) && !i!.locked)
          .map((i) => ({ id: i.id, ox: i.xFt, oy: i.yFt, ox2: i.x2Ft, oy2: i.y2Ft }));
        drag.current = { mode: 'move', set, sx: e.clientX, sy: e.clientY, downId: id, downWasSel: wasSel, moved: false };
        return;
      }
      onSelectItem?.(null);
      setPanning(true);
      setView((v) => {
        pan.current = { x: e.clientX, y: e.clientY, panX: v.panX, panY: v.panY };
        return v;
      });
    },
    [interactive, items, onSelectItem, selectedIds, toFt],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      if (d && onUpdateItem) {
        if (d.mode === 'move') {
          const lead = d.set.find((s) => s.id === d.downId) ?? d.set[0];
          if (!lead) return;
          let dx = (e.clientX - d.sx) / view.zoom / ft(1);
          let dy = (e.clientY - d.sy) / view.zoom / ft(1);
          if (snap) {
            const lx = snapToGrid(ft(lead.ox + dx), gridSizeFt) / ft(1);
            const ly = snapToGrid(ft(lead.oy + dy), gridSizeFt) / ft(1);
            dx = lx - lead.ox;
            dy = ly - lead.oy;
          }
          if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) d.moved = true;
          for (const s of d.set) {
            const patch: Partial<EditorItem> = { xFt: +(s.ox + dx).toFixed(2), yFt: +(s.oy + dy).toFixed(2) };
            if (s.ox2 != null && s.oy2 != null) {
              patch.x2Ft = +(s.ox2 + dx).toFixed(2);
              patch.y2Ft = +(s.oy2 + dy).toFixed(2);
            }
            onUpdateItem(s.id, patch);
          }
        } else if (d.mode === 'resize') {
          const c = toFt(e.clientX, e.clientY);
          const dist = Math.hypot(c.xFt - d.cx, c.yFt - d.cy) || 0.01;
          const scale = Math.max(0.2, Math.min(6, (d.startScale * dist) / d.startDist));
          onUpdateItem(d.id, { scale: +scale.toFixed(2) });
        } else if (d.mode === 'arrow') {
          const c = toFt(e.clientX, e.clientY);
          const xFt = snap ? snapToGrid(ft(c.xFt), gridSizeFt) / ft(1) : c.xFt;
          const yFt = snap ? snapToGrid(ft(c.yFt), gridSizeFt) / ft(1) : c.yFt;
          onUpdateItem(d.id, d.end === 'a' ? { xFt: +xFt.toFixed(2), yFt: +yFt.toFixed(2) } : { x2Ft: +xFt.toFixed(2), y2Ft: +yFt.toFixed(2) });
        }
        return;
      }
      const p = pan.current;
      if (!p) return;
      setView((v) => ({ ...v, panX: p.panX + (e.clientX - p.x), panY: p.panY + (e.clientY - p.y) }));
    },
    [onUpdateItem, view.zoom, snap, gridSizeFt, toFt],
  );

  const endInteraction = useCallback(() => {
    const d = drag.current;
    // Single-click a selected text box → edit inline.
    if (d?.mode === 'move' && !d.moved && d.downWasSel) {
      const it = items.find((i) => i.id === d.downId);
      if (it?.kind === 'text') setEditing(it.id);
    }
    pan.current = null;
    drag.current = null;
    setPanning(false);
  }, [items]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const iconName = e.dataTransfer.getData('text/plain');
      if (!iconName || !onDropIcon) return;
      const c = toFt(e.clientX, e.clientY);
      const xFt = snap ? snapToGrid(ft(c.xFt), gridSizeFt) / ft(1) : c.xFt;
      const yFt = snap ? snapToGrid(ft(c.yFt), gridSizeFt) / ft(1) : c.yFt;
      onDropIcon(iconName, +xFt.toFixed(2), +yFt.toFixed(2));
    },
    [onDropIcon, toFt, snap, gridSizeFt],
  );

  const stageW = ft(widthFt);
  const stageH = ft(depthFt);
  const g = ft(gridSizeFt);
  const labelEvery = Math.max(1, Math.round(4 / gridSizeFt));
  const xTicks = Array.from({ length: Math.floor(widthFt / gridSizeFt) + 1 }, (_, i) => i);
  const yTicks = Array.from({ length: Math.floor(depthFt / gridSizeFt) + 1 }, (_, i) => i);
  const editingItem = editing ? items.find((i) => i.id === editing) : null;
  const editFs = editingItem ? Math.max(12, ft(editingItem.fontSizeFt ?? 0.7) * view.zoom) : 14;

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--lp-bg-secondary)', cursor: panning ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endInteraction}
      onPointerCancel={endInteraction}
      onContextMenu={onContextMenu}
      onDragOver={onDropIcon ? (e) => e.preventDefault() : undefined}
      onDrop={onDropIcon ? onDrop : undefined}
    >
      <svg width={size.w} height={size.h} style={{ display: 'block' }}>
        <defs>
          <pattern id="lp-grid-fine" width={g / 2} height={g / 2} patternUnits="userSpaceOnUse">
            <circle cx={g / 2} cy={g / 2} r={0.6} className="lp-canvas-grid-dot-fine" />
          </pattern>
          <pattern id="lp-grid" width={g} height={g} patternUnits="userSpaceOnUse">
            <circle cx={g} cy={g} r={1.4} className="lp-canvas-grid-dot" />
          </pattern>
          <marker id="lp-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--lp-text-secondary)" />
          </marker>
        </defs>
        <g transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom})`}>
          <rect className="lp-canvas-stage" x={0} y={0} width={stageW} height={stageH} rx={4} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          {showGrid && (
            <>
              <rect x={0} y={0} width={stageW} height={stageH} fill="url(#lp-grid-fine)" />
              <rect x={0} y={0} width={stageW} height={stageH} fill="url(#lp-grid)" />
            </>
          )}

          {showRulers && (
            <g>
              {xTicks.map((i) => (
                <g key={`x${i}`}>
                  <line className="lp-canvas-ruler" x1={i * g} y1={-6} x2={i * g} y2={0} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  {i % labelEvery === 0 && <text className="lp-canvas-ruler-text" x={i * g} y={-9} textAnchor="middle">{i * gridSizeFt}</text>}
                </g>
              ))}
              {yTicks.map((i) => (
                <g key={`y${i}`}>
                  <line className="lp-canvas-ruler" x1={-6} y1={i * g} x2={0} y2={i * g} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  {i % labelEvery === 0 && <text className="lp-canvas-ruler-text" x={-9} y={i * g + 3} textAnchor="end">{i * gridSizeFt}</text>}
                </g>
              ))}
            </g>
          )}

          {showCenterLine && <line x1={stageW / 2} y1={0} x2={stageW / 2} y2={stageH} stroke="var(--lp-border-strong)" strokeWidth={1} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
          {showDsCross && (
            <g stroke="var(--lp-text-tertiary)" strokeWidth={1.25} vectorEffect="non-scaling-stroke">
              <line x1={stageW / 2 - ft(0.6)} y1={stageH} x2={stageW / 2 + ft(0.6)} y2={stageH} />
              <line x1={stageW / 2} y1={stageH - ft(0.6)} x2={stageW / 2} y2={stageH + ft(0.6)} />
            </g>
          )}
          {showLateralMarkers &&
            Array.from({ length: Math.floor(widthFt / 2 / 2) }, (_, i) => (i + 1) * 2).flatMap((dd) =>
              [stageW / 2 - ft(dd), stageW / 2 + ft(dd)].map((x, k) => (
                <g key={`lm${dd}${k}`}>
                  <line className="lp-canvas-ruler" x1={x} y1={stageH} x2={x} y2={stageH + 5} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  <text className="lp-canvas-ruler-text" x={x} y={stageH + 12} textAnchor="middle">{dd}</text>
                </g>
              )),
            )}

          <text className="lp-canvas-cardinal" x={stageW / 2} y={-18} textAnchor="middle">US</text>
          <text className="lp-canvas-cardinal" x={stageW / 2} y={stageH + 22} textAnchor="middle">DS</text>
          <text className="lp-canvas-cardinal" x={-22} y={stageH / 2} textAnchor="middle">SR</text>
          <text className="lp-canvas-cardinal" x={stageW + 22} y={stageH / 2} textAnchor="middle">SL</text>
          <text className="lp-canvas-audience" x={stageW / 2} y={stageH + 40} textAnchor="middle">AUDIENCE</text>

          {items.map((it) => {
            const sel = selSet.has(it.id);
            if (it.kind === 'arrow') {
              const x1 = ft(it.xFt);
              const y1 = ft(it.yFt);
              const x2 = ft(it.x2Ft ?? it.xFt + 3);
              const y2 = ft(it.y2Ft ?? it.yFt);
              const stroke = it.colorTint ?? 'var(--lp-text-secondary)';
              return (
                <g key={it.id} data-canvas-item={it.id} style={{ cursor: interactive ? 'move' : undefined }}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={16} />
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={it.weight ?? 2} markerEnd="url(#lp-arrow)" vectorEffect="non-scaling-stroke" />
                  {sel && interactive && (
                    <>
                      <circle data-arrow-end={`${it.id}:a`} cx={x1} cy={y1} r={9} fill="transparent" style={{ cursor: 'crosshair' }} />
                      <circle data-arrow-end={`${it.id}:b`} cx={x2} cy={y2} r={9} fill="transparent" style={{ cursor: 'crosshair' }} />
                      <circle cx={x1} cy={y1} r={4} fill="none" stroke="var(--lp-orange)" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                      <circle cx={x2} cy={y2} r={4} fill="none" stroke="var(--lp-orange)" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                    </>
                  )}
                </g>
              );
            }
            if (it.kind === 'text') {
              const cx = ft(it.xFt);
              const cy = ft(it.yFt);
              const fs = ft(it.fontSizeFt ?? 0.7);
              const fill = it.colorTint ?? 'var(--lp-text)';
              const txt = it.text || 'Text';
              const halfW = Math.max(fs * 1.3, fs * 0.3 * txt.length + fs * 0.5);
              const halfH = fs * 0.85;
              const isEd = editing === it.id;
              return (
                <g key={it.id} data-canvas-item={it.id} style={{ cursor: interactive ? 'move' : undefined }} onDoubleClick={() => interactive && setEditing(it.id)}>
                  <rect x={cx - halfW} y={cy - halfH} width={halfW * 2} height={halfH * 2} rx={2} fill="none" stroke={sel ? 'var(--lp-orange)' : 'var(--lp-border-strong)'} strokeWidth={sel ? 1.5 : 1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
                  {!isEd && <text x={cx} y={cy} fontSize={fs} fill={fill} textAnchor="middle" dominantBaseline="central" fontWeight={600}>{txt}</text>}
                </g>
              );
            }
            const icon = getIcon(it.iconName);
            if (!icon) return null;
            const wpx = ft(it.widthFt ?? icon.footprint.width_ft);
            const hpx = ft(it.depthFt ?? icon.footprint.depth_ft);
            const cx = ft(it.xFt);
            const cy = ft(it.yFt);
            const cat = getCategory(icon.category);
            const isPerson = cat.key === 'musicians';
            const isRiser = it.iconName.startsWith('infra-riser-');
            const linked = (it.channelRowIds ?? []).map((cid) => channels.find((c) => c.id === cid)).filter((c): c is NonNullable<typeof c> => Boolean(c));
            const ch = linked[0];
            // VIS-SP-02 — items are NEUTRAL. Stroke = the explicit per-item tint
            // if set, else a neutral gray; the channel's colour no longer paints
            // the whole item (it moves to the stripe-tick chip, VIS-SP-03). The
            // fill is a faint neutral brand wash (brandColor now defaults neutral).
            // Orange is reserved for selection only.
            const stroke = it.colorTint ?? 'var(--lp-text-secondary)';
            const fill = icon.outline
              ? 'none'
              : it.colorTint ?? `color-mix(in srgb, ${brandColor} ${ICON_BRAND_TINT_PCT}%, transparent)`;
            const style = { fill, stroke, '--lp-cat': stroke } as CSSProperties & Record<string, string>;
            const bx = cx + wpx / 2;
            const by = cy - hpx / 2;
            const labelPos = (it.labelPosition ?? 'bottom') as LabelPosition;
            const labelText = it.label ?? icon.label;
            const labelPx = it.labelFontPx ?? 11;
            const halfW = isPerson ? 5 : wpx / 2;
            const halfH = isPerson ? 5 : hpx / 2;
            return (
              <g key={it.id} data-canvas-item={it.id} style={{ cursor: interactive ? 'move' : undefined }}>
                <g transform={`rotate(${it.rotationDeg ?? 0} ${cx} ${cy})`}>
                  {sel && <rect x={cx - halfW - 4} y={cy - halfH - 4} width={halfW * 2 + 8} height={halfH * 2 + 8} rx={3} fill="none" stroke="var(--lp-orange)" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
                  {isPerson ? (
                    /* §SP-FIX-4: person marker = neutral position dot (not a silhouette). */
                    <circle cx={cx} cy={cy} r={5} fill="var(--lp-text-secondary)" stroke="var(--lp-bg)" strokeWidth={1.25} />
                  ) : isRiser ? (
                    /* §SP-FIX-5: riser = very faint brand fill (doesn't obstruct
                       gear placed on it) + 1px brand outline + W×D×H dims label
                       along the top edge (rotates with the riser). */
                    <>
                      <rect
                        x={cx - wpx / 2}
                        y={cy - hpx / 2}
                        width={wpx}
                        height={hpx}
                        rx={6}
                        fill={`color-mix(in srgb, ${brandColor} 7%, transparent)`}
                        stroke={`color-mix(in srgb, ${brandColor} 30%, transparent)`}
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                      />
                      <text x={cx} y={cy - hpx / 2 + 12} fontSize={11} fill="var(--lp-text-secondary)" textAnchor="middle" dominantBaseline="central" fontWeight={600}>
                        {`${it.widthFt ?? icon.footprint.width_ft} × ${it.depthFt ?? icon.footprint.depth_ft} × ${it.heightFt ?? 1} ft`}
                      </text>
                    </>
                  ) : (
                    <svg x={cx - wpx / 2} y={cy - hpx / 2} width={wpx} height={hpx} viewBox={icon.viewBox ?? '0 0 100 100'} preserveAspectRatio="xMidYMid meet" className="lp-canvas-item" style={style} dangerouslySetInnerHTML={{ __html: icon.body }} />
                  )}
                  {/* VIS-SP-03 — linked-channel chip: NEUTRAL pill + a colour
                      STRIPE tick (channel identity) + the channel number. Shown
                      for every linked item (persons included) when the overlay is
                      on. Orange stays selection-only — the chip carries no orange. */}
                  {showChannels && ch && (
                    <g>
                      <rect x={bx - 8} y={by - 7} width={20} height={12} rx={3} fill="var(--lp-surface)" stroke="var(--lp-border-strong)" strokeWidth={0.75} />
                      <rect x={bx - 8} y={by - 7} width={3} height={12} rx={1.5} fill={ch.color || 'var(--lp-text-tertiary)'} />
                      <text x={bx + 3} y={by - 1} fontSize={8} fill="var(--lp-text)" textAnchor="middle" dominantBaseline="central" fontWeight={700}>
                        {linked.length > 1 ? `×${linked.length}` : ch.snakeLabel || String(ch.number)}
                      </text>
                    </g>
                  )}
                </g>
                {labelPos !== 'hidden' && labelText && (
                  <ItemLabel cx={cx} cy={cy} halfW={halfW} halfH={halfH} text={labelText} px={labelPx} position={labelPos} heavy={isPerson} />
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {editingItem && (
        <input
          autoFocus
          defaultValue={editingItem.text ?? ''}
          onBlur={(e) => {
            onUpdateItem?.(editingItem.id, { text: e.target.value });
            setEditing(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setEditing(null);
          }}
          style={{
            position: 'absolute',
            left: view.panX + ft(editingItem.xFt) * view.zoom - 90,
            top: view.panY + ft(editingItem.yFt) * view.zoom - editFs * 0.9,
            width: 180,
            textAlign: 'center',
            fontSize: editFs,
            fontWeight: 600,
            padding: '3px 6px',
            borderRadius: 5,
            border: '1px solid var(--lp-orange)',
            background: 'var(--lp-bg)',
            color: 'var(--lp-text)',
          }}
        />
      )}

      {ctxMenu && (
        <div
          style={{ position: 'absolute', left: ctxMenu.x, top: ctxMenu.y, zIndex: 20, minWidth: 150, padding: 4, borderRadius: 8, border: '1px solid var(--lp-border)', background: 'var(--lp-surface)', boxShadow: '0 6px 20px rgba(0,0,0,0.25)' }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {([['front', 'Bring to front'], ['forward', 'Forward'], ['backward', 'Backward'], ['back', 'Send to back']] as const).map(([op, label]) => (
            <button
              key={op}
              type="button"
              onClick={() => { onReorderItem?.(ctxMenu.id, op); setCtxMenu(null); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none', background: 'none', color: 'var(--lp-text-secondary)', cursor: 'pointer', fontSize: 'var(--lp-text-xs)', borderRadius: 5 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--lp-surface-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              {label}
            </button>
          ))}
          <div style={{ height: 1, background: 'var(--lp-border)', margin: '4px 0' }} />
          <button
            type="button"
            onClick={() => { onDeleteItem?.(ctxMenu.id); setCtxMenu(null); }}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none', background: 'none', color: 'var(--lp-danger, #e5484d)', cursor: 'pointer', fontSize: 'var(--lp-text-xs)', borderRadius: 5 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--lp-surface-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
