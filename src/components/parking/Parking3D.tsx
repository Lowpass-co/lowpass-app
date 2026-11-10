'use client';

/* ============================================
   <Parking3D> — the parking map in 3D (phase 2, Nov 2026, Adam)

   The same drawing as the overhead plan, on Google's photorealistic 3D city,
   vehicles as true-size blocks. Looking only: things are placed and moved on
   the overhead plan. "Use this view for the PDF" saves the camera (in the
   map's `view.cam3d`), and the PDF's page 2 is drawn from it.
   ============================================ */

import { useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw } from 'lucide-react';
import type * as CesiumNS from 'cesium';
import type { Camera3d, LatLng, Pt } from '@/lib/parking/geo';
import type { ParkingItem } from '@/lib/parking/model';
import { defaultCamera3d } from '@/lib/parking/blocks3d';
import { loadCesium, type CesiumModule } from './loadCesium';
import { applyCamera, createViewer, lookAt, populate, readCamera } from './scene3d';
import { resolvePalette } from './palette';
import { tilesKey } from './googleTiles';

export interface Parking3DProps {
  anchor: LatLng;
  items: ParkingItem[];
  /** Where to look when no camera is saved: the print frame's centre / size and the plan's rotation. */
  fallback: { centre: Pt; extent: number; rotation: number };
  cam3d: Camera3d | undefined;
  canEdit: boolean;
  onUseView: (cam: Camera3d) => void;
}

export function Parking3D({ anchor, items, fallback, cam3d, canEdit, onUseView }: Parking3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumNS.Viewer | null>(null);
  const cesiumRef = useRef<CesiumModule | null>(null);
  const groundRef = useRef(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const key = tilesKey();

  // Built once per mount: the 3D page is entered from the overhead plan and
  // remounts each time, so it always shows the drawing as it now stands.
  const initial = useRef({ anchor, items, fallback, cam3d });
  useEffect(() => {
    let dead = false;
    const { anchor: a, items: its, fallback: fb, cam3d: cam } = initial.current;
    loadCesium()
      .then(async (Cesium) => {
        if (dead || !host.current) return;
        cesiumRef.current = Cesium;
        const palette = resolvePalette();
        const viewer = createViewer(Cesium, host.current, { withTiles: !!key, blank: palette.blank, sky: palette.sky });
        viewerRef.current = viewer;
        // Point the camera first, so the tiles that load are the ones we need.
        const def = defaultCamera3d(fb.centre, fb.extent, fb.rotation);
        lookAt(Cesium, viewer, a, def.target, 0, def.heading, def.pitch, def.range);
        const scene = await populate(Cesium, viewer, { anchor: a, items: its, palette, tilesKey: key });
        if (dead) return;
        groundRef.current = scene.ground0;
        if (cam) applyCamera(Cesium, viewer, a, cam);
        else lookAt(Cesium, viewer, a, def.target, scene.ground0, def.heading, def.pitch, def.range);
        setState('ready');
      })
      .catch((e: unknown) => {
        if (dead) return;
        setError(e instanceof Error ? e.message : 'The 3D view could not start');
        setState('error');
      });
    return () => {
      dead = true;
      const v = viewerRef.current;
      viewerRef.current = null;
      if (v && !v.isDestroyed()) v.destroy();
    };
  }, [key]);

  const reset = () => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!Cesium || !viewer) return;
    const def = defaultCamera3d(fallback.centre, fallback.extent, fallback.rotation);
    lookAt(Cesium, viewer, anchor, def.target, groundRef.current, def.heading, def.pitch, def.range);
  };

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} aria-label="3D view of the parking map" />
      {state !== 'ready' ? (
        <div className="pk-badge" style={{ top: 'var(--lp-space-3)', left: 'var(--lp-space-3)', maxWidth: 380, pointerEvents: 'auto' }}>
          {state === 'loading' ? 'Loading the 3D city…' : `3D didn’t start: ${error}. (It needs WebGL — try Chrome.)`}
        </div>
      ) : null}
      {state === 'ready' && !key ? (
        <div className="pk-badge" style={{ top: 'var(--lp-space-3)', left: 'var(--lp-space-3)', maxWidth: 380 }}>
          No Google Map Tiles key — vehicles are true size, but there are no buildings around them.
        </div>
      ) : null}
      <div className="pk-hint" style={{ top: 'auto', bottom: 'calc(var(--lp-space-6) * 2)' }} onPointerDown={(e) => e.stopPropagation()}>
        <span className="pk-muted" style={{ color: 'var(--lp-text-secondary)' }}>Drag to move · right-drag or Ctrl-drag to tilt and turn · scroll to zoom</span>
        <button type="button" className="adv-btn adv-btn-sm" onClick={reset} disabled={state !== 'ready'}>
          <RotateCcw size={13} aria-hidden /> Reset view
        </button>
        {canEdit ? (
          <button
            type="button"
            className="adv-btn adv-btn-sm adv-btn-primary"
            disabled={state !== 'ready'}
            onClick={() => viewerRef.current && onUseView(readCamera(viewerRef.current, anchor))}
          >
            <Camera size={13} aria-hidden /> Use this view for the PDF
          </button>
        ) : null}
      </div>
    </div>
  );
}
