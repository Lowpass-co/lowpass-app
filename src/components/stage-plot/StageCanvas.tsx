/* ============================================
   LOWPASS — <StageCanvas> (§SP2 + annotations)

   SVG stage surface: dotted grid (faint sub-foot + bold foot),
   stage rect, edge rulers, cardinals (US/DS/SR/SL), AUDIENCE,
   reference markers, and items (icons, text boxes, arrows) at
   real footprint scale. Pan (drag empty) + wheel zoom.
   Interactive when callbacks are supplied: drop icons from the
   palette, click to select, drag to move, drag the corner handle
   to resize, drag arrow endpoints, double-click text to edit.
   Pure SVG so the same DOM exports to PDF (§SP7).
   ============================================ */
'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { getCategory, getIcon } from '@/lib/stage-plot/icons';
import { ICON_BRAND_TINT_PCT } from '@/lib/stage-plot/icons/types';
import { DEFAULT_VIEW, ft, fitView, snapToGrid, zoomAt, type ViewTransform } from '@/lib/stage-plot/geometry';
import type { EditorItem } from '@/lib/stage-plot/editor-types';

const DEFAULT_BRAND = '#FF4500';
export type CanvasItem = EditorItem;

export interface StageCanvasProps {
  widthFt: number;
  depthFt: number;
  gridSizeFt?: number;
  showGrid?: boolean;
  showRulers?: boolean;
  showCenterLine?: boolean;
  showDsCross?: boolean;
  showLateralMarkers?: boolean;
  snap?: boolean;
  items: EditorItem[];
  brandColor?: string;
  selectedId?: string | null;
  onSelectItem?: (id: string | null) => void;
  onUpdateItem?: (id: string, patch: Partial<EditorItem>) => void;
  onDropIcon?: (iconName: string, xFt: number, yFt: number) => void;
  className?: string;
}

type Drag =
  | { mode: 'move'; id: string; sx: number; sy: number; ox: number; oy: number; ox2?: number; oy2?: number }
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
  snap = true,
  items,
  brandColor = DEFAULT_BRAND,
  selectedId = null,
  onSelectItem,
  onUpdateItem,
  onDropIcon,
  className,
}: StageCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<ViewTransform>(DEFAULT_VIEW);
  const [panning, setPanning] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const fitted = useRef(false);
  const pan = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const interactive = Boolean(onUpdateItem || onSelectItem);

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

  /** screen px (clientX/Y) → feet in stage space. */
  const toFt = useCallback(
    (clientX: number, clientY: number) => {
      const rect = hostRef.current?.getBoundingClientRect();
      const px = ((clientX - (rect?.left ?? 0)) - view.panX) / view.zoom;
      const py = ((clientY - (rect?.top ?? 0)) - view.panY) / view.zoom;
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
        onSelectItem?.(id);
        return;
      }
      const itemEl = el.closest('[data-canvas-item]');
      if (itemEl && interactive) {
        const id = itemEl.getAttribute('data-canvas-item')!;
        const it = items.find((i) => i.id === id);
        onSelectItem?.(id);
        if (it && !it.locked && onUpdateItem) {
          drag.current = { mode: 'move', id, sx: e.clientX, sy: e.clientY, ox: it.xFt, oy: it.yFt, ox2: it.x2Ft, oy2: it.y2Ft };
        }
        return;
      }
      onSelectItem?.(null);
      setPanning(true);
      setView((v) => {
        pan.current = { x: e.clientX, y: e.clientY, panX: v.panX, panY: v.panY };
        return v;
      });
    },
    [interactive, items, onSelectItem, onUpdateItem, toFt],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      if (d && onUpdateItem) {
        if (d.mode === 'move') {
          let dx = (e.clientX - d.sx) / view.zoom / ft(1);
          let dy = (e.clientY - d.sy) / view.zoom / ft(1);
          let xFt = d.ox + dx;
          let yFt = d.oy + dy;
          if (snap) {
            xFt = snapToGrid(ft(xFt), gridSizeFt) / ft(1);
            yFt = snapToGrid(ft(yFt), gridSizeFt) / ft(1);
            dx = xFt - d.ox;
            dy = yFt - d.oy;
          }
          const patch: Partial<EditorItem> = { xFt: +xFt.toFixed(2), yFt: +yFt.toFixed(2) };
          if (d.ox2 != null && d.oy2 != null) {
            patch.x2Ft = +(d.ox2 + dx).toFixed(2);
            patch.y2Ft = +(d.oy2 + dy).toFixed(2);
          }
          onUpdateItem(d.id, patch);
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
    pan.current = null;
    drag.current = null;
    setPanning(false);
  }, []);

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

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--lp-bg-secondary)', cursor: panning ? 'grabbing' : 'grab', touchAction: 'none' }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endInteraction}
      onPointerCancel={endInteraction}
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
            Array.from({ length: Math.floor(widthFt / 2 / 2) }, (_, i) => (i + 1) * 2).flatMap((d) =>
              [stageW / 2 - ft(d), stageW / 2 + ft(d)].map((x, k) => (
                <g key={`lm${d}${k}`}>
                  <line className="lp-canvas-ruler" x1={x} y1={stageH} x2={x} y2={stageH + 5} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  <text className="lp-canvas-ruler-text" x={x} y={stageH + 12} textAnchor="middle">{d}</text>
                </g>
              )),
            )}

          <text className="lp-canvas-cardinal" x={stageW / 2} y={-18} textAnchor="middle">US</text>
          <text className="lp-canvas-cardinal" x={stageW / 2} y={stageH + 22} textAnchor="middle">DS</text>
          <text className="lp-canvas-cardinal" x={-22} y={stageH / 2} textAnchor="middle">SR</text>
          <text className="lp-canvas-cardinal" x={stageW + 22} y={stageH / 2} textAnchor="middle">SL</text>
          <text className="lp-canvas-audience" x={stageW / 2} y={stageH + 40} textAnchor="middle">AUDIENCE</text>

          {items.map((it) => {
            const sel = it.id === selectedId;
            // --- ARROW ---
            if (it.kind === 'arrow') {
              const x1 = ft(it.xFt);
              const y1 = ft(it.yFt);
              const x2 = ft(it.x2Ft ?? it.xFt + 3);
              const y2 = ft(it.y2Ft ?? it.yFt);
              const stroke = it.colorTint ?? 'var(--lp-text-secondary)';
              return (
                <g key={it.id} data-canvas-item={it.id} style={{ cursor: interactive ? 'move' : undefined }}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={14} />
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={2} markerEnd="url(#lp-arrow)" vectorEffect="non-scaling-stroke" />
                  {sel && interactive && (
                    <>
                      <circle data-arrow-end={`${it.id}:a`} cx={x1} cy={y1} r={5} fill="var(--lp-orange)" style={{ cursor: 'crosshair' }} />
                      <circle data-arrow-end={`${it.id}:b`} cx={x2} cy={y2} r={5} fill="var(--lp-orange)" style={{ cursor: 'crosshair' }} />
                    </>
                  )}
                </g>
              );
            }
            // --- TEXT ---
            if (it.kind === 'text') {
              const cx = ft(it.xFt);
              const cy = ft(it.yFt);
              const fs = ft(it.fontSizeFt ?? 1.1) * (it.scale ?? 1);
              const fill = it.colorTint ?? 'var(--lp-text)';
              return (
                <g key={it.id} data-canvas-item={it.id} style={{ cursor: interactive ? 'move' : undefined }} onDoubleClick={() => interactive && setEditing(it.id)}>
                  <text x={cx} y={cy} fontSize={fs} fill={fill} textAnchor="middle" dominantBaseline="central" fontWeight={600}>
                    {it.text || 'Text'}
                  </text>
                  {sel && (
                    <rect x={cx - fs * 2.5} y={cy - fs * 0.8} width={fs * 5} height={fs * 1.6} rx={2} fill="none" stroke="var(--lp-orange)" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
                  )}
                </g>
              );
            }
            // --- ICON ---
            const icon = getIcon(it.iconName);
            if (!icon) return null;
            const sc = it.scale ?? 1;
            const wFt = (it.widthFt ?? icon.footprint.width_ft) * sc;
            const dFt = (it.depthFt ?? icon.footprint.depth_ft) * sc;
            const cx = ft(it.xFt);
            const cy = ft(it.yFt);
            const wpx = ft(wFt);
            const hpx = ft(dFt);
            const cat = getCategory(icon.category).colorVar;
            const fill = icon.outline ? 'none' : it.colorTint ?? `color-mix(in srgb, ${brandColor} ${ICON_BRAND_TINT_PCT}%, transparent)`;
            const style = { fill, stroke: cat, '--lp-cat': cat } as CSSProperties & Record<string, string>;
            return (
              <g key={it.id} data-canvas-item={it.id} transform={`rotate(${it.rotationDeg ?? 0} ${cx} ${cy})`} style={{ cursor: interactive ? 'move' : undefined }}>
                {sel && <rect x={cx - wpx / 2 - 4} y={cy - hpx / 2 - 4} width={wpx + 8} height={hpx + 8} rx={3} fill="none" stroke="var(--lp-orange)" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
                <svg x={cx - wpx / 2} y={cy - hpx / 2} width={wpx} height={hpx} viewBox={icon.viewBox ?? '0 0 100 100'} preserveAspectRatio="xMidYMid meet" className="lp-canvas-item" style={style} dangerouslySetInnerHTML={{ __html: icon.body }} />
                {sel && interactive && (
                  <rect data-resize={it.id} x={cx + wpx / 2 + 1} y={cy + hpx / 2 + 1} width={9} height={9} rx={1.5} fill="var(--lp-orange)" style={{ cursor: 'nwse-resize' }} />
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Inline text editor */}
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
            left: view.panX + ft(editingItem.xFt) * view.zoom - 80,
            top: view.panY + ft(editingItem.yFt) * view.zoom - 14,
            width: 160,
            textAlign: 'center',
            fontSize: 14,
            fontWeight: 600,
            padding: '3px 6px',
            borderRadius: 5,
            border: '1px solid var(--lp-orange)',
            background: 'var(--lp-bg)',
            color: 'var(--lp-text)',
          }}
        />
      )}
    </div>
  );
}
