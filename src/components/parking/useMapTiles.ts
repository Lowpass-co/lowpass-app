'use client';

/* Google satellite tiles for a parking map view — the editor and the driver
   page share it. Tiles are fetched for the view and never stored (Google's
   terms); the attribution and max zoom come from the viewport endpoint. */

import { useEffect, useMemo, useState } from 'react';
import { tileRect, tileZoomFor, toLatLng, viewBounds, visibleTiles, type LatLng, type View } from '@/lib/parking/geo';
import { getTileSession, tileUrl, tilesKey, viewportInfo, type TileSession } from './googleTiles';
import type { SceneTile } from './ParkingScene';

export function useMapTiles(anchor: LatLng | null, view: View, size: { w: number; h: number }, satelliteOn: boolean) {
  const [session, setSession] = useState<TileSession | null>(null);
  const [imageryError, setImageryError] = useState<string | null>(tilesKey() ? null : 'not-configured');
  const [attribution, setAttribution] = useState('');
  const [maxZoom, setMaxZoom] = useState(20);

  useEffect(() => {
    if (!tilesKey() || !anchor) return;
    let live = true;
    getTileSession()
      .then((s) => live && setSession(s))
      .catch((e: Error) => live && setImageryError(e.message));
    return () => {
      live = false;
    };
  }, [anchor]);

  const dpr = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const tiles: SceneTile[] = useMemo(() => {
    if (!satelliteOn || !session || !anchor || !size.w) return [];
    const z = tileZoomFor(anchor.lat, view.ppm, dpr, session.tileScale, maxZoom);
    const layer = (zz: number) =>
      visibleTiles(anchor, view, size.w, size.h, zz, 64).map((k) => ({ id: `${k.z}/${k.x}/${k.y}`, href: tileUrl(session, k), ...tileRect(anchor, k) }));
    // A coarse layer underneath, so zooming never flashes blank.
    const under = z - 3 >= 1 ? layer(z - 3) : [];
    return [...under, ...layer(z)];
  }, [satelliteOn, session, anchor, view, size.w, size.h, dpr, maxZoom]);

  useEffect(() => {
    if (!session || !anchor || !size.w) return;
    const t = setTimeout(() => {
      const z = tileZoomFor(anchor.lat, view.ppm, dpr, session.tileScale, 22);
      viewportInfo(session, z, viewBounds(anchor, view, size.w, size.h), toLatLng(anchor, { x: view.cx, y: view.cy }))
        .then((v) => {
          setAttribution(v.copyright);
          setMaxZoom(v.maxZoom);
        })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [session, anchor, view, size.w, size.h, dpr]);

  return { session, tiles, attribution, maxZoom, imageryError };
}
