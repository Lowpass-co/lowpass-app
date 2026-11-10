'use client';

/* ============================================
   Venue drawings → what the plan, the PDF and 3D draw (Nov 2026, Adam)

   useDrawingRasters renders each drawing's crop once (drawingRaster.ts) and
   keeps both looks: the light original (lines on the satellite, the paper
   multiplied away) and the dark copy (inside drawings / no satellite — the
   plan's dark map, white selection lines still visible). The plan gets
   SceneDrawings; the PDF and 3D get the canvases themselves.
   ============================================ */

import { useEffect, useMemo, useRef, useState } from 'react';
import { svgMatrix } from '@/lib/parking/drawings';
import type { ParkingDrawing } from '@/lib/parking/model';
import { canvasUrl, darkCopy, drawingLook, renderCrop, type DrawingFileRef } from './drawingRaster';
import { resolvePalette } from './palette';
import type { SceneDrawing } from './ParkingScene';

export interface DrawingRaster {
  key: string;
  light: HTMLCanvasElement;
  dark: HTMLCanvasElement;
  lightUrl: string;
  darkUrl: string;
}

export const rasterKey = (d: Pick<ParkingDrawing, 'fileId' | 'page' | 'crop'>, f?: DrawingFileRef) =>
  `${d.fileId}:${f?.path ?? ''}:${d.page}:${d.crop.u0},${d.crop.v0},${d.crop.u1},${d.crop.v1}`;

/** Rasters for the drawings whose files are known; errors by drawing id.
 *  Renders run to the end even if the drawing changes meanwhile (an opacity
 *  drag mustn't cancel them); a result lands only if its drawing still wants
 *  that raster. Rasters of removed drawings are filtered out on read and
 *  their URLs freed on the next render or on unmount. */
export function useDrawingRasters(drawings: ParkingDrawing[], files: ReadonlyMap<string, DrawingFileRef>) {
  const [rasters, setRasters] = useState<ReadonlyMap<string, DrawingRaster>>(new Map());
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const pending = useRef(new Set<string>());
  /** drawing id → the raster key it wants now. */
  const wanted = useRef(new Map<string, string>());
  const mounted = useRef(true);
  const all = useRef(rasters);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const r of all.current.values()) {
        URL.revokeObjectURL(r.lightUrl);
        URL.revokeObjectURL(r.darkUrl);
      }
    };
  }, []);

  useEffect(() => {
    all.current = rasters;
  }, [rasters]);

  useEffect(() => {
    const paper = resolvePalette().paper;
    const want = new Map<string, string>();
    for (const d of drawings) {
      const f = files.get(d.fileId);
      if (f) want.set(d.id, rasterKey(d, f));
    }
    wanted.current = want;
    for (const d of drawings) {
      const f = files.get(d.fileId);
      const key = want.get(d.id);
      if (!f || !key) continue;
      if (all.current.get(d.id)?.key === key || pending.current.has(`${d.id}|${key}`)) continue;
      pending.current.add(`${d.id}|${key}`);
      renderCrop(f, d, paper)
        .then(async (light) => {
          const dark = darkCopy(light);
          const [lightUrl, darkUrl] = await Promise.all([canvasUrl(light), canvasUrl(dark)]);
          if (!mounted.current || wanted.current.get(d.id) !== key) {
            URL.revokeObjectURL(lightUrl);
            URL.revokeObjectURL(darkUrl);
            return;
          }
          setRasters((m) => {
            const next = new Map(m);
            const old = next.get(d.id);
            if (old) {
              URL.revokeObjectURL(old.lightUrl);
              URL.revokeObjectURL(old.darkUrl);
            }
            // Free rasters of drawings that are gone.
            for (const [id, r] of next) {
              if (wanted.current.has(id)) continue;
              URL.revokeObjectURL(r.lightUrl);
              URL.revokeObjectURL(r.darkUrl);
              next.delete(id);
            }
            next.set(d.id, { key, light, dark, lightUrl, darkUrl });
            return next;
          });
          setErrors((m) => {
            if (!m.has(d.id)) return m;
            const next = new Map(m);
            next.delete(d.id);
            return next;
          });
        })
        .catch((e: unknown) => {
          if (mounted.current) setErrors((m) => new Map(m).set(d.id, e instanceof Error ? e.message : 'The drawing couldn’t be opened.'));
        })
        .finally(() => pending.current.delete(`${d.id}|${key}`));
    }
  }, [drawings, files]);

  const live = useMemo(() => {
    const ids = new Set(drawings.map((d) => d.id));
    return new Map([...rasters].filter(([id]) => ids.has(id)));
  }, [rasters, drawings]);
  return { rasters: live as ReadonlyMap<string, DrawingRaster>, errors };
}

/** Is a drawing on the level being shown? (No level picked = every level.) */
export function onLevel(d: Pick<ParkingDrawing, 'inside' | 'floor'>, level: number | undefined): boolean {
  if (level == null) return true;
  return d.inside ? d.floor === level : level === 0;
}

/** The plan's drawing layer, bottom to top: outside drawings, then inside ones by floor. */
export function sceneDrawings(
  drawings: ParkingDrawing[],
  rasters: ReadonlyMap<string, DrawingRaster>,
  satelliteOn: boolean,
  level: number | undefined,
): SceneDrawing[] {
  return drawings
    .filter((d) => !d.hidden && rasters.has(d.id) && onLevel(d, level))
    .sort((a, b) => Number(a.inside) - Number(b.inside) || a.floor - b.floor)
    .map((d) => {
      const r = rasters.get(d.id)!;
      const look = drawingLook(d, satelliteOn);
      return {
        id: d.id,
        href: look === 'lines' ? r.lightUrl : r.darkUrl,
        matrix: svgMatrix(d),
        x: d.crop.u0,
        y: d.crop.v0,
        w: d.crop.u1 - d.crop.u0,
        h: d.crop.v1 - d.crop.v0,
        opacity: d.opacity,
        blend: look === 'lines' ? 'multiply' : 'normal',
      };
    });
}
