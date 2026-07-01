'use client';

import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { greatCirclePoints } from '@/lib/utils';
import { brandedPinSvg, PIN_SIZE, PIN_ANCHOR } from '@/lib/routing/mapPin';

import 'leaflet/dist/leaflet.css';

export type MapRow = {
  date: string;
  venue_name: string | null;
  city: string;
  day_type: string;
};

/** Fit bounds only once when points first become available so user pan/zoom is not overwritten. */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const hasFitted = useRef(false);
  useEffect(() => {
    if (points.length === 0 || hasFitted.current) return;
    hasFitted.current = true;
    if (points.length === 1) {
      map.setView(points[0], 8);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 10 });
    }
    requestAnimationFrame(() => map.invalidateSize({ animate: false }));
  }, [map, points]);
  return null;
}

/**
 * Leaflet computes tile positions from container size. In flex/grid layouts the map often mounts
 * before the final height exists — tiles then stay misaligned until invalidateSize runs.
 */
function MapLayoutSync({ revision }: { revision: string }) {
  const map = useMap();
  useEffect(() => {
    const run = () => {
      map.invalidateSize({ animate: false });
    };
    const el = map.getContainer();
    const raf = requestAnimationFrame(run);
    const t1 = window.setTimeout(run, 0);
    const t2 = window.setTimeout(run, 120);
    const t3 = window.setTimeout(run, 400);
    const ro = new ResizeObserver(() => run());
    ro.observe(el);
    window.addEventListener('resize', run);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      ro.disconnect();
      window.removeEventListener('resize', run);
    };
  }, [map, revision]);
  return null;
}

function toCoord(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return { lat: la, lng: lo };
}

// Branded teardrop shared with the in-app routing map (src/lib/routing/mapPin).
// Fixed size + tip anchor, no transform → the tip locks to the coordinate at any
// zoom. Token-clean (var(--lp-orange) inside the inline SVG).
const PIN_ICON =
  typeof window !== 'undefined'
    ? L.divIcon({
        html: brandedPinSvg(),
        iconSize: PIN_SIZE,
        iconAnchor: PIN_ANCHOR,
        className: 'border-0 bg-transparent',
      })
    : null;

const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png';
const TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

export function BudgetRoutingMap({ rows }: { rows: MapRow[] }) {
  const [coords, setCoords] = useState<Map<number, { lat: number; lng: number }>>(new Map());
  const [colorSchemeDark, setColorSchemeDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setColorSchemeDark(root.classList.contains('dark'));
    read();
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const next = new Map<number, { lat: number; lng: number }>();
    const toFetch: { i: number; address: string }[] = [];

    rows.forEach((row, i) => {
      const address = [row.venue_name, row.city].filter(Boolean).join(', ');
      if (address) toFetch.push({ i, address });
    });

    if (toFetch.length === 0) {
      setCoords(next);
      return;
    }

    let done = 0;
    toFetch.forEach(({ i, address }) => {
      fetch(`/api/geocode?address=${encodeURIComponent(address)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const c = toCoord(data?.lat, data?.lng);
          if (c) next.set(i, c);
        })
        .catch(() => {})
        .finally(() => {
          done++;
          if (done === toFetch.length) setCoords(new Map(next));
        });
    });
  }, [rows]);

  const pointsWithIndex: { coord: { lat: number; lng: number }; i: number }[] = rows
    .map((_, i) => ({ coord: coords.get(i), i }))
    .filter((x): x is { coord: { lat: number; lng: number }; i: number } => x.coord != null);

  const boundsPoints: [number, number][] = pointsWithIndex.map((p) => [p.coord.lat, p.coord.lng]);
  const center: [number, number] = boundsPoints.length
    ? boundsPoints[Math.floor(boundsPoints.length / 2)]
    : [20, 0];

  const layoutRevision = `${colorSchemeDark ? 'd' : 'l'}-${boundsPoints.length}-${center[0]}-${center[1]}`;

  return (
    <div className="lp-budget-routing-map relative z-0 flex h-full min-h-[200px] w-full flex-col overflow-hidden rounded-xl">
      <style>{`
        .lp-budget-route {
          animation: lp-dash-move 25s linear infinite;
        }
        @keyframes lp-dash-move {
          to { stroke-dashoffset: -160; }
        }
        .lp-budget-routing-map .leaflet-tile {
          border-radius: 0;
        }
        .lp-budget-routing-map .leaflet-container {
          background: var(--lp-surface);
        }
        html:not(.dark) .lp-budget-routing-map .leaflet-control-zoom a {
          background-color: #ff4500 !important;
          color: #ffffff !important;
          border-color: rgba(255, 255, 255, 0.45) !important;
          font-weight: 700;
          line-height: 26px;
        }
        html:not(.dark) .lp-budget-routing-map .leaflet-control-zoom a:hover {
          background-color: #e63e00 !important;
          color: #ffffff !important;
        }
        .dark .lp-budget-routing-map .leaflet-control-zoom a {
          background-color: rgba(30, 30, 30, 0.92) !important;
          color: #f5f5f5 !important;
          border-color: rgba(255, 255, 255, 0.12) !important;
        }
      `}</style>

      {/* pointer-events-none so pan/zoom/drag still reach Leaflet when there are no plotted venues yet */}
      {boundsPoints.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <p className="max-w-sm rounded-lg bg-lp-surface/90 px-4 py-2 text-center text-sm text-lp-text-secondary shadow-sm">
            No venue locations yet — add venues or addresses to routing rows to plot markers. You can still
            pan and zoom the map.
          </p>
        </div>
      )}

      <MapContainer
        key={colorSchemeDark ? 'map-dark' : 'map-light'}
        center={center}
        zoom={3}
        className="min-h-0 flex-1 [&_.leaflet-container]:h-full [&_.leaflet-container]:min-h-[200px] [&_.leaflet-container]:w-full"
        style={{ height: '100%', minHeight: 200 }}
        zoomControl={true}
        scrollWheelZoom={true}
        dragging={true}
        attributionControl={false}
      >
        <MapLayoutSync revision={layoutRevision} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CARTO'
          url={colorSchemeDark ? TILE_DARK : TILE_LIGHT}
          maxZoom={19}
          maxNativeZoom={19}
        />
        {boundsPoints.length > 0 && <FitBounds points={boundsPoints} />}

        {pointsWithIndex.map(({ coord, i }) => (
          <Marker
            key={i}
            position={[coord.lat, coord.lng]}
            icon={PIN_ICON ?? undefined}
          />
        ))}

        {pointsWithIndex.length >= 2 &&
          pointsWithIndex.slice(0, -1).map(({ coord: c1 }, idx) => {
            const c2 = pointsWithIndex[idx + 1]?.coord;
            if (!c2) return null;
            const arc = greatCirclePoints(c1.lat, c1.lng, c2.lat, c2.lng, 24);
            return (
              <Polyline
                key={idx}
                positions={arc}
                pathOptions={{
                  color: '#FF4500',
                  weight: 1.5,
                  opacity: 0.65,
                  dashArray: '10 6',
                  className: 'lp-budget-route',
                }}
              />
            );
          })}
      </MapContainer>
    </div>
  );
}
