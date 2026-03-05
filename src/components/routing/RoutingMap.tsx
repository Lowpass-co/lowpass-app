/* ============================================
   LOWPASS — Routing Map

   Plots tour dates as pins, routes between as
   simplified arcs. Hover (delayed) tooltip; click
   goes to day. Zoom to world, design-language styling.
   ============================================ */

'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { parseRoutingDate, getDayTypeLabel, getDayTypeColor } from '@/lib/utils';
import { greatCirclePoints } from '@/lib/utils';
import type { RoutingRow } from './RoutingGrid';
import { cn } from '@/lib/utils';

import 'leaflet/dist/leaflet.css';

// Fix default marker icons in Next.js (Leaflet expects window)
const defaultIcon =
  typeof window !== 'undefined'
    ? L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
      })
    : null;

const ROUTE_COLORS = {
  default: '#0ea5e9',   // sky-500
  drive: '#22c55e',     // emerald-500
  fly: '#a855f7',       // violet-500
} as const;

export type PrimaryTransit = 'bus_van' | 'bus_trailer' | 'car' | 'flight';

interface RoutingMapProps {
  rows: RoutingRow[];
  primaryTransit: PrimaryTransit;
  onSelectDate: (date: string) => void;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 10);
      return;
    }
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 11 });
  }, [map, points]);
  return null;
}

const DEFAULT_CENTER: [number, number] = [20, 0];
const DEFAULT_ZOOM = 3;

function toCoord(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const la = typeof lat === 'number' ? lat : parseFloat(String(lat));
  const lo = typeof lng === 'number' ? lng : parseFloat(String(lng));
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return { lat: la, lng: lo };
}

export function RoutingMap({ rows, primaryTransit, onSelectDate }: RoutingMapProps) {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [coords, setCoords] = useState<Map<number, { lat: number; lng: number }>>(new Map());
  const [hoverLeg, setHoverLeg] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ date: string; row: RoutingRow; legIndex: number } | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  // Geocode rows missing lat/lng (batch); parse API/row values as numbers and reject NaN
  useEffect(() => {
    const next = new Map<number, { lat: number; lng: number }>();
    const toFetch: { i: number; address: string }[] = [];
    rows.forEach((row, i) => {
      const c = toCoord(row.latitude, row.longitude);
      if (c) {
        next.set(i, c);
        return;
      }
      const address = [row.address, row.city, row.venue_name].filter(Boolean).join(', ');
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

  const pointsWithCoords = rows
    .map((row, i) => ({ row, i, coord: coords.get(i) }))
    .filter((x): x is { row: RoutingRow; i: number; coord: { lat: number; lng: number } } => {
      if (x.coord == null) return false;
      const { lat, lng } = x.coord;
      return Number.isFinite(lat) && Number.isFinite(lng) && !Number.isNaN(lat) && !Number.isNaN(lng);
    });

  const boundsPoints: [number, number][] = pointsWithCoords.map((p) => [p.coord.lat, p.coord.lng]);
  const center: [number, number] = boundsPoints.length
    ? boundsPoints[Math.floor(boundsPoints.length / 2)]
    : DEFAULT_CENTER;

  const handleLegMouseEnter = (legIndex: number) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoverLeg(legIndex);
    hoverTimeoutRef.current = setTimeout(() => {
      const row = rows[legIndex + 1];
      if (row) setTooltip({ date: row.date, row, legIndex });
    }, 400);
  };

  const handleLegMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoverLeg(null);
    setTooltip(null);
  };

  const handleLegClick = (legIndex: number) => {
    const row = rows[legIndex + 1];
    if (row) onSelectDate(row.date);
  };

  // Defer map render until client mount so Leaflet has a sized container (fixes Next.js blank map)
  if (!mounted) {
    return (
      <div className="flex min-h-[500px] items-center justify-center rounded-xl border border-lp-border bg-lp-surface text-lp-text-secondary">
        Loading map…
      </div>
    );
  }

  return (
    <div className="relative h-[500px] w-full rounded-xl border border-lp-border overflow-hidden bg-lp-surface">
      {/* Empty state overlay: show map underneath so the view always has a map */}
      {pointsWithCoords.length === 0 && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-lp-surface/80 backdrop-blur-[2px] rounded-xl">
          <p className="text-center text-lp-text-secondary px-4">
            No venues with locations yet. Add venues to your routing dates to see them on the map.
          </p>
        </div>
      )}

      <div
        className={cn(
          'absolute left-4 top-4 z-[1000] rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm shadow-lg transition-opacity duration-150',
          tooltip ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        {tooltip && (
          <>
            <div className="font-medium text-lp-text">
              {parseRoutingDate(tooltip.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
            <div className="mt-0.5 text-lp-text-secondary">{tooltip.row.venue_name || tooltip.row.city || '—'}</div>
            {tooltip.row.day_type && (
              <div className="mt-0.5 text-xs text-lp-text-tertiary">{getDayTypeLabel(tooltip.row.day_type)}</div>
            )}
          </>
        )}
      </div>

      <MapContainer
        center={center}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full rounded-xl z-0"
        style={{ height: '100%' }}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={isDark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'}
        />
        {boundsPoints.length > 0 && <FitBounds points={boundsPoints} />}

        {pointsWithCoords.map(({ row, i, coord }) => {
          const parsedDate = parseRoutingDate(row.date);
          const dateFormatted = parsedDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
          const dayTypeColors = row.day_type ? getDayTypeColor(row.day_type) : null;
          return (
            <Marker
              key={row.date}
              position={[coord.lat, coord.lng]}
              icon={defaultIcon ?? undefined}
            >
              <Popup>
                <div style={{ minWidth: '180px' }}>
                  <div style={{ color: '#999', fontSize: '13px' }}>{dateFormatted}</div>
                  {row.venue_name && <div style={{ fontWeight: 700, color: 'var(--lp-text)', marginTop: '2px' }}>{row.venue_name}</div>}
                  {row.city && <div style={{ color: '#999', fontSize: '13px' }}>{row.city}</div>}
                  {row.day_type && dayTypeColors && (
                    <span
                      className={cn(
                        'inline-block rounded px-1.5 py-0.5 text-xs font-medium mt-1',
                        dayTypeColors.bg,
                        dayTypeColors.text
                      )}
                    >
                      {getDayTypeLabel(row.day_type)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onSelectDate(row.date)}
                    onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                    style={{ color: '#FF4500', fontSize: '13px', marginTop: '8px', display: 'block', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                  >
                    View in grid →
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {pointsWithCoords.length >= 2 &&
          pointsWithCoords.slice(0, -1).map((p, idx) => {
            const next = pointsWithCoords[idx + 1];
            if (!next) return null;
            const { lat: lat1, lng: lng1 } = p.coord;
            const { lat: lat2, lng: lng2 } = next.coord;
            if (!Number.isFinite(lat1) || !Number.isFinite(lng1) || !Number.isFinite(lat2) || !Number.isFinite(lng2)) {
              return null;
            }
            const mode = p.row.transport_to_next ?? 'default';
            const color = ROUTE_COLORS[mode] ?? ROUTE_COLORS.default;
            const isFly = mode === 'fly';
            const arc = greatCirclePoints(lat1, lng1, lat2, lng2, 20);
            const isHover = hoverLeg === p.i;
            const legKey = `leg-${p.row.date}-${next.row.date}`;

            return (
              <Fragment key={legKey}>
                {/* Invisible wide polyline for easier hover/click */}
                <Polyline
                  positions={arc}
                  pathOptions={{ color: 'transparent', weight: 20, opacity: 0 }}
                  eventHandlers={{
                    mouseover: () => handleLegMouseEnter(p.i),
                    mouseout: handleLegMouseLeave,
                    click: () => handleLegClick(p.i),
                  }}
                />
                <Polyline
                  positions={arc}
                  pathOptions={{
                    color,
                    weight: isHover ? 5 : 3,
                    opacity: isHover ? 0.95 : 0.8,
                    dashArray: isFly ? '8,8' : undefined,
                  }}
                />
              </Fragment>
            );
          })}
      </MapContainer>
    </div>
  );
}
