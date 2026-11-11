'use client';

/* ============================================
   <ParkingViewer> — a parking map to LOOK at (driver links, Nov 2026)

   The same <ParkingScene> as the editor, read-only: drag / pinch / wheel to
   move and zoom, buttons to zoom and turn. Opens framed on what's drawn
   (the editor's last view may be a laptop's zoom). Satellite tiles via
   useMapTiles; drawings rendered by the caller (rasters + their files).
   ============================================ */

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Compass, Minus, Plus, RotateCcw, RotateCw } from 'lucide-react';
import { niceLength, normDeg, unproject, zoomAt, fmtMetres, type LatLng, type Pt, type View } from '@/lib/parking/geo';
import { footprint, headroomWarnings } from '@/lib/parking/drawings';
import type { ParkingDrawing, ParkingItem } from '@/lib/parking/model';
import { itemPoints } from '@/lib/parking/print';
import { ParkingScene } from './ParkingScene';
import { LIVE_PALETTE } from './palette';
import { useMapTiles } from './useMapTiles';
import { sceneDrawings, type DrawingRaster } from './drawingLayers';

/** The view that shows everything drawn (items and drawings) on this screen. */
export function fitView(items: ParkingItem[], drawings: ParkingDrawing[], rotation: number, size: { w: number; h: number }, fallback: View): View {
  const pts: Pt[] = [...itemPoints(items), ...drawings.filter((d) => !d.hidden).flatMap((d) => footprint(d))];
  if (!pts.length || !size.w) return { ...fallback, rotation };
  const r = (rotation * Math.PI) / 180;
  const us = pts.map((p) => p.x * Math.cos(r) - p.y * Math.sin(r));
  const vs = pts.map((p) => p.x * Math.sin(r) + p.y * Math.cos(r));
  const uc = (Math.min(...us) + Math.max(...us)) / 2;
  const vc = (Math.min(...vs) + Math.max(...vs)) / 2;
  const span = { w: Math.max(40, Math.max(...us) - Math.min(...us)), h: Math.max(40, Math.max(...vs) - Math.min(...vs)) };
  const ppm = Math.min(size.w / span.w, size.h / span.h) * 0.85;
  return { cx: uc * Math.cos(r) + vc * Math.sin(r), cy: -uc * Math.sin(r) + vc * Math.cos(r), ppm, rotation };
}

export function ParkingViewer({
  anchor,
  view0,
  items,
  drawings,
  rasters,
  satellite,
}: {
  anchor: LatLng;
  view0: View;
  items: ParkingItem[];
  drawings: ParkingDrawing[];
  rasters: ReadonlyMap<string, DrawingRaster>;
  satellite: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>(view0);
  // Framed on what's drawn the first time the size is known (from the
  // observer's callback — the map arrives with the page, before this mounts).
  const first = useRef({ items, drawings, view0, fitted: false });
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const sz = { w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) };
      setSize(sz);
      const f = first.current;
      if (!f.fitted && sz.w) {
        f.fitted = true;
        setView(fitView(f.items, f.drawings, f.view0.rotation, sz, f.view0));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { session, tiles, attribution } = useMapTiles(anchor, view, size, satellite);
  const scene = useMemo(() => sceneDrawings(drawings, rasters, satellite && !!session, undefined), [drawings, rasters, satellite, session]);
  const warnIds = useMemo(() => new Set(headroomWarnings(items, drawings).flatMap((w) => w.vehicleIds)), [items, drawings]);

  // Drag to move, two fingers / wheel to zoom.
  const pointers = useRef(new Map<number, Pt>());
  const drag = useRef<{ start: Pt; view0: View } | { d0: number; view0: View; mid: Pt } | null>(null);
  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = host.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: ReactPointerEvent) => {
    host.current?.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    const ps = [...pointers.current.values()];
    drag.current =
      ps.length === 2
        ? { d0: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), view0: view, mid: { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } }
        : { start: local(e), view0: view };
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    const d = drag.current;
    if (!d) return;
    if ('d0' in d) {
      const ps = [...pointers.current.values()];
      if (ps.length < 2) return;
      setView(zoomAt(d.view0, size.w, size.h, d.mid, Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) / Math.max(1, d.d0)));
      return;
    }
    const s = local(e);
    const a = unproject(d.view0, size.w, size.h, d.start);
    const b = unproject(d.view0, size.w, size.h, s);
    setView({ ...d.view0, cx: d.view0.cx - (b.x - a.x), cy: d.view0.cy - (b.y - a.y) });
  };
  const onUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    drag.current = pointers.current.size === 1 ? { start: [...pointers.current.values()][0], view0: view } : null;
  };
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView((v) => zoomAt(v, r.width, r.height, { x: e.clientX - r.left, y: e.clientY - r.top }, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const scaleM = niceLength(90 / view.ppm);
  const zoom = (f: number) => setView((v) => zoomAt(v, size.w, size.h, { x: size.w / 2, y: size.h / 2 }, f));

  return (
    <div
      ref={host}
      className="pk-map pd-map"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="img"
      aria-label="Parking map — drag to move, pinch to zoom"
    >
      {size.w ? (
        <ParkingScene view={view} width={size.w} height={size.h} items={items} tiles={tiles} palette={LIVE_PALETTE} drawings={scene} warnIds={warnIds} grid={!session || !satellite} />
      ) : null}
      <div className="pk-ctrls" onPointerDown={(e) => e.stopPropagation()}>
        <div className="pk-ctrl-group">
          <button type="button" className="pk-ctrl" aria-label="Zoom in" onClick={() => zoom(1.5)}><Plus size={16} /></button>
          <button type="button" className="pk-ctrl" aria-label="Zoom out" onClick={() => zoom(1 / 1.5)}><Minus size={16} /></button>
        </div>
        <div className="pk-ctrl-group">
          <button type="button" className="pk-ctrl" aria-label="Turn the map left" onClick={() => setView((v) => ({ ...v, rotation: normDeg(v.rotation - 15) }))}><RotateCcw size={16} /></button>
          <button type="button" className="pk-ctrl" aria-label="North up" onClick={() => setView((v) => ({ ...v, rotation: 0 }))}>
            <Compass size={18} style={{ transform: `rotate(${-view.rotation - 45}deg)` }} />
          </button>
          <button type="button" className="pk-ctrl" aria-label="Turn the map right" onClick={() => setView((v) => ({ ...v, rotation: normDeg(v.rotation + 15) }))}><RotateCw size={16} /></button>
        </div>
      </div>
      <div className="pk-badge pk-scale">
        <span>{fmtMetres(scaleM)}</span>
        <span className="pk-scale-bar" style={{ width: scaleM * view.ppm }} />
      </div>
      {session && satellite ? <div className="pk-badge" style={{ right: 'var(--lp-space-2)', bottom: 'var(--lp-space-2)' }}>Google Maps{attribution ? ` · ${attribution}` : ''}</div> : null}
    </div>
  );
}
