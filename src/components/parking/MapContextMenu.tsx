'use client';

/* ============================================
   LOWPASS — right-click on the parking plan (Nov 2026, Adam: "right click on
   the plan view should bring up a context menu, not the browser's").

   On something: what you'd do to it — duplicate, turn, colour, Flat in 3D,
   delete. On the empty map: add a vehicle or marker right there, north up,
   this view as a PDF page. Every action is the editor's own (same undo,
   same save); this file only lays them out. Esc / click away closes.
   ============================================ */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Copy, Navigation, RotateCcw, RotateCw, Trash2, FileImage, Layers } from 'lucide-react';
import { MARKERS, PAINTS, VEHICLE_TILES, vehicleSpec, type MarkerType, type PaintId, type VehicleRegion, type VehicleType } from '@/lib/parking/catalogue';
import type { ParkingItem } from '@/lib/parking/model';
import { LIVE_PALETTE, roleColour } from './palette';
import { MARKER_ICON } from './ParkingScene';

export interface MapMenuActions {
  canEdit: boolean;
  region: VehicleRegion;
  addVehicle: (t: VehicleType) => void;
  addMarker: (t: MarkerType) => void;
  duplicate: () => void;
  turn: (by: number) => void;
  colour: (c: PaintId | undefined) => void;
  toggleFlat3d: () => void;
  remove: () => void;
  northUp: () => void;
  addPage: () => void;
}

export function MapContextMenu({
  x,
  y,
  bounds,
  items,
  actions,
  onClose,
}: {
  /** Where the click was, px inside the map. */
  x: number;
  y: number;
  bounds: { w: number; h: number };
  /** What was right-clicked (the selection), or none for the empty map. */
  items: ParkingItem[];
  actions: MapMenuActions;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Keep the whole menu inside the map.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setPos({ left: Math.max(4, Math.min(x, bounds.w - w - 4)), top: Math.max(4, Math.min(y, bounds.h - h - 4)) });
  }, [x, y, bounds.w, bounds.h]);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key);
    window.addEventListener('wheel', onClose, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', key);
      window.removeEventListener('wheel', onClose);
    };
  }, [onClose]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const a = actions;
  const vehicles = items.filter((i) => i.kind === 'vehicle');
  const area = items.length === 1 && items[0].kind === 'area' ? items[0] : null;
  const title =
    items.length > 1
      ? `${items.length} selected`
      : items[0]
        ? ('label' in items[0] && items[0].label) || (items[0].kind === 'vehicle' ? vehicleSpec(items[0].type)?.label ?? 'Vehicle' : items[0].kind === 'measure' ? 'Measurement' : items[0].kind[0].toUpperCase() + items[0].kind.slice(1))
        : null;

  return (
    <div
      ref={ref}
      className="pk-menu"
      role="menu"
      aria-label={title ?? 'Map'}
      style={{ left: pos.left, top: pos.top }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.length && a.canEdit ? (
        <>
          <div className="pk-menu-title">{title}</div>
          <button type="button" role="menuitem" onClick={run(a.duplicate)}>
            <Copy size={14} aria-hidden /> Duplicate
          </button>
          {vehicles.length || items.length > 1 ? (
            <>
              <button type="button" role="menuitem" onClick={run(() => a.turn(90))}>
                <RotateCw size={14} aria-hidden /> Turn 90° right
              </button>
              <button type="button" role="menuitem" onClick={run(() => a.turn(-90))}>
                <RotateCcw size={14} aria-hidden /> Turn 90° left
              </button>
            </>
          ) : null}
          {vehicles.length ? (
            <div className="pk-menu-paints" role="group" aria-label="Colour">
              <button type="button" role="menuitem" aria-label="Default colour" title="Default — each type's colour" className="pk-paint pk-paint-default" style={{ background: roleColour(LIVE_PALETTE, 'bus') }} onClick={run(() => a.colour(undefined))} />
              {PAINTS.map((c) => (
                <button key={c.id} type="button" role="menuitem" aria-label={c.label} title={c.label} className="pk-paint" style={{ background: `var(--lp-map-paint-${c.id})` }} onClick={run(() => a.colour(c.id))} />
              ))}
            </div>
          ) : null}
          {area ? (
            <button type="button" role="menuitemcheckbox" aria-checked={!!area.flat3d} onClick={run(a.toggleFlat3d)}>
              <Layers size={14} aria-hidden /> {area.flat3d ? 'Show the 3D model here' : 'Flat in 3D here'}
            </button>
          ) : null}
          <div className="pk-menu-sep" />
          <button type="button" role="menuitem" className="pk-menu-danger" onClick={run(a.remove)}>
            <Trash2 size={14} aria-hidden /> Delete
          </button>
        </>
      ) : (
        <>
          {a.canEdit ? (
            <>
              <div className="pk-menu-title">Add here</div>
              {VEHICLE_TILES[a.region].map((t) => {
                const v = vehicleSpec(t.type)!;
                return (
                  <button key={t.type} type="button" role="menuitem" onClick={run(() => a.addVehicle(t.type))}>
                    <span className="pk-swatch pk-swatch-sm" style={{ background: roleColour(LIVE_PALETTE, v.role) }} aria-hidden />
                    {t.label}
                    <span className="pk-menu-hint">
                      {v.length} × {v.width}
                    </span>
                  </button>
                );
              })}
              <div className="pk-menu-icons" role="group" aria-label="Markers">
                {MARKERS.map((m) => {
                  const Icon = MARKER_ICON[m.type];
                  return (
                    <button key={m.type} type="button" role="menuitem" aria-label={`${m.label} here`} title={m.label} onClick={run(() => a.addMarker(m.type))}>
                      <Icon size={15} aria-hidden />
                    </button>
                  );
                })}
              </div>
              <div className="pk-menu-sep" />
            </>
          ) : null}
          <button type="button" role="menuitem" onClick={run(a.northUp)}>
            <Navigation size={14} aria-hidden /> North up
          </button>
          {a.canEdit ? (
            <button type="button" role="menuitem" onClick={run(a.addPage)}>
              <FileImage size={14} aria-hidden /> This view as a PDF page
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
