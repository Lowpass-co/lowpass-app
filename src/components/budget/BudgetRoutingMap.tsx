'use client';

import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { greatCirclePoints } from '@/lib/utils';

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
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 10 });
  }, [map, points]);
  return null;
}

function toCoord(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return { lat: la, lng: lo };
}

const DOT_ICON =
  typeof window !== 'undefined'
    ? L.divIcon({
        html: `<div style="width:8px;height:8px;border-radius:50%;background:#FF4500;border:2px solid rgba(255,69,0,0.35);box-shadow:0 0 8px rgba(255,69,0,0.55)"></div>`,
        iconSize: [8, 8],
        iconAnchor: [4, 4],
        className: '',
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

  return (
    <div className="lp-budget-routing-map relative isolate z-0 h-full w-full overflow-hidden rounded-xl">
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

      {boundsPoints.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <p className="text-lp-text-tertiary text-sm text-center px-6">
            No venue locations — add venues with addresses to your routing dates.
          </p>
        </div>
      )}

      <MapContainer
        center={center}
        zoom={3}
        className="h-full w-full"
        style={{ height: '100%' }}
        zoomControl={true}
        scrollWheelZoom={true}
        dragging={true}
        attributionControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CARTO'
          url={colorSchemeDark ? TILE_DARK : TILE_LIGHT}
          maxZoom={19}
          maxNativeZoom={19}
          className={colorSchemeDark ? 'brightness-[1.02] contrast-[1.05]' : 'contrast-[1.03] saturate-[1.02]'}
        />
        {boundsPoints.length > 0 && <FitBounds points={boundsPoints} />}

        {pointsWithIndex.map(({ coord, i }) => (
          <Marker
            key={i}
            position={[coord.lat, coord.lng]}
            icon={DOT_ICON ?? undefined}
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
