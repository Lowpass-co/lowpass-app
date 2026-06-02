/* ============================================
   LOWPASS — <StageCanvas> (§SP2a)

   The SVG stage surface: dotted grid, stage rectangle, edge
   rulers, cardinal labels (US/DS/SL/SR), AUDIENCE marker, and
   placed items rendered from the icon registry. Pan (drag empty
   canvas) + zoom (wheel toward cursor). Render-only here;
   selection + drag-drop land in §SP2b.

   Pure SVG so the same DOM exports to PDF via Puppeteer (§SP7)
   and hit-testing is native per element.
   ============================================ */
'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { getCategory, getIcon } from '@/lib/stage-plot/icons';
import { ICON_BRAND_TINT_PCT } from '@/lib/stage-plot/icons/types';
import {
  BASE_PX_PER_FOOT,
  DEFAULT_VIEW,
  ft,
  fitView,
  zoomAt,
  type ViewTransform,
} from '@/lib/stage-plot/geometry';

const DEFAULT_BRAND = '#FF4500';

export interface CanvasItem {
  id: string;
  iconName: string;
  /** Centre position in feet from the stage's upstage-left origin. */
  xFt: number;
  yFt: number;
  widthFt?: number;
  depthFt?: number;
  rotationDeg?: number;
  colorTint?: string | null;
}

export interface StageCanvasProps {
  widthFt: number;
  depthFt: number;
  gridSizeFt?: number;
  showGrid?: boolean;
  showRulers?: boolean;
  items: CanvasItem[];
  brandColor?: string;
  className?: string;
}

export function StageCanvas({
  widthFt,
  depthFt,
  gridSizeFt = 1,
  showGrid = true,
  showRulers = true,
  items,
  brandColor = DEFAULT_BRAND,
  className,
}: StageCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<ViewTransform>(DEFAULT_VIEW);
  const [panning, setPanning] = useState(false);
  const fitted = useRef(false);
  const pan = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // Measure host + fit the stage once we have dimensions.
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

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView((v) => zoomAt(v, factor, e.clientX - rect.left, e.clientY - rect.top));
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Pan only when starting on empty canvas (not on an item).
    if ((e.target as Element).closest('[data-canvas-item]')) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setPanning(true);
    setView((v) => {
      pan.current = { x: e.clientX, y: e.clientY, panX: v.panX, panY: v.panY };
      return v;
    });
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const p = pan.current;
    if (!p) return;
    setView((v) => ({ ...v, panX: p.panX + (e.clientX - p.x), panY: p.panY + (e.clientY - p.y) }));
  }, []);

  const endPan = useCallback(() => {
    pan.current = null;
    setPanning(false);
  }, []);

  const stageW = ft(widthFt);
  const stageH = ft(depthFt);
  const g = ft(gridSizeFt);

  // Ruler ticks every grid step; labels every ~4 ft.
  const labelEvery = Math.max(1, Math.round(4 / gridSizeFt));
  const xTicks = Array.from({ length: Math.floor(widthFt / gridSizeFt) + 1 }, (_, i) => i);
  const yTicks = Array.from({ length: Math.floor(depthFt / gridSizeFt) + 1 }, (_, i) => i);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--lp-bg-secondary)', cursor: panning ? 'grabbing' : 'grab', touchAction: 'none' }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
    >
      <svg width={size.w} height={size.h} style={{ display: 'block' }}>
        <defs>
          <pattern id="lp-grid" width={g} height={g} patternUnits="userSpaceOnUse">
            <circle cx={g} cy={g} r={1} className="lp-canvas-grid-dot" />
          </pattern>
        </defs>
        <g transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom})`}>
          {/* Stage */}
          <rect className="lp-canvas-stage" x={0} y={0} width={stageW} height={stageH} rx={4} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          {showGrid && <rect x={0} y={0} width={stageW} height={stageH} fill="url(#lp-grid)" />}

          {/* Rulers along top + left edges */}
          {showRulers && (
            <g>
              {xTicks.map((i) => (
                <g key={`x${i}`}>
                  <line className="lp-canvas-ruler" x1={i * g} y1={-6} x2={i * g} y2={0} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  {i % labelEvery === 0 && (
                    <text className="lp-canvas-ruler-text" x={i * g} y={-9} textAnchor="middle">{i * gridSizeFt}</text>
                  )}
                </g>
              ))}
              {yTicks.map((i) => (
                <g key={`y${i}`}>
                  <line className="lp-canvas-ruler" x1={-6} y1={i * g} x2={0} y2={i * g} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  {i % labelEvery === 0 && (
                    <text className="lp-canvas-ruler-text" x={-9} y={i * g + 3} textAnchor="end">{i * gridSizeFt}</text>
                  )}
                </g>
              ))}
            </g>
          )}

          {/* Cardinal labels (SR = page-left, SL = page-right) */}
          <text className="lp-canvas-cardinal" x={stageW / 2} y={-18} textAnchor="middle">US</text>
          <text className="lp-canvas-cardinal" x={stageW / 2} y={stageH + 24} textAnchor="middle">DS</text>
          <text className="lp-canvas-cardinal" x={-22} y={stageH / 2} textAnchor="middle">SR</text>
          <text className="lp-canvas-cardinal" x={stageW + 22} y={stageH / 2} textAnchor="middle">SL</text>
          <text className="lp-canvas-audience" x={stageW / 2} y={stageH + 42} textAnchor="middle">AUDIENCE</text>

          {/* Items */}
          {items.map((it) => {
            const icon = getIcon(it.iconName);
            if (!icon) return null;
            const wFt = it.widthFt ?? icon.footprint.width_ft;
            const dFt = it.depthFt ?? icon.footprint.depth_ft;
            const cx = ft(it.xFt);
            const cy = ft(it.yFt);
            const wpx = ft(wFt);
            const hpx = ft(dFt);
            const cat = getCategory(icon.category).colorVar;
            const fill = icon.outline
              ? 'none'
              : it.colorTint ?? `color-mix(in srgb, ${brandColor} ${ICON_BRAND_TINT_PCT}%, transparent)`;
            const style = { fill, stroke: cat, '--lp-cat': cat } as CSSProperties & Record<string, string>;
            return (
              <g key={it.id} data-canvas-item={it.id} transform={`rotate(${it.rotationDeg ?? 0} ${cx} ${cy})`}>
                <svg
                  x={cx - wpx / 2}
                  y={cy - hpx / 2}
                  width={wpx}
                  height={hpx}
                  viewBox={icon.viewBox ?? '0 0 100 100'}
                  preserveAspectRatio="xMidYMid meet"
                  className="lp-canvas-item"
                  style={style}
                  dangerouslySetInnerHTML={{ __html: icon.body }}
                />
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

export { BASE_PX_PER_FOOT };
