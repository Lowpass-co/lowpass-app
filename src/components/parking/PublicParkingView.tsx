'use client';

/* ============================================
   /p/[token] — a driver's parking map (Nov 2026, Adam — migration 289)

   No account, no app chrome, phone first. The plan opens (2D tiles — free at
   tour scale); "Look around in 3D" asks the server first, which takes one of
   the link's capped 3D opens (each is a billed Google session). "Get there"
   hands each gate to the driver's own maps app. Everything comes from
   /api/public/parking/[token], which checks the token, expiry and scope.
   ============================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Box, Navigation, TriangleAlert } from 'lucide-react';
import { headroomWarnings } from '@/lib/parking/drawings';
import { navigateUrls } from '@/lib/parking/driverLinks';
import { toLatLng } from '@/lib/parking/geo';
import { markerSpec, vehicleSpec } from '@/lib/parking/catalogue';
import { printFrame } from '@/lib/parking/print';
import type { DriverMapPayload } from '@/server/parking/driverLinks';
import { ParkingViewer } from './ParkingViewer';
import { Parking3D } from './Parking3D';
import { useDrawingRasters } from './drawingLayers';
import { LIVE_PALETTE, vehicleColour } from './palette';
import type { DrawingFileRef } from './drawingRaster';
import './parking.css';
import './driver.css';

type Loaded = { kind: 'ok'; data: DriverMapPayload } | { kind: 'error'; message: string } | { kind: 'loading' };

export function PublicParkingView({ token }: { token: string }) {
  const [state, setState] = useState<Loaded>({ kind: 'loading' });
  const [mode, setMode] = useState<'plan' | '3d'>('plan');
  const [left3d, setLeft3d] = useState(0);
  const [note3d, setNote3d] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/public/parking/${encodeURIComponent(token)}`, { method: 'POST' })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as DriverMapPayload & { error?: string };
        if (!live) return;
        if (!r.ok) return setState({ kind: 'error', message: j.error ?? 'This link couldn’t be opened.' });
        setState({ kind: 'ok', data: j });
        setLeft3d(j.remaining3d);
      })
      .catch(() => live && setState({ kind: 'error', message: 'No connection — try again in a moment.' }));
    return () => {
      live = false;
    };
  }, [token]);

  const data = state.kind === 'ok' ? state.data : null;
  const files = useMemo(
    () => new Map<string, DrawingFileRef>((data?.files ?? []).map((f) => [f.id, { id: f.id, name: f.name, kind: f.kind, bucket: null, path: null, url: f.url }])),
    [data],
  );
  const drawings = useMemo(() => data?.map.drawings ?? [], [data]);
  const { rasters } = useDrawingRasters(drawings, files);
  const floors = useMemo(() => new Map([...rasters].map(([id, r]) => [id, r.dark])), [rasters]);

  const open3d = useCallback(async () => {
    setOpening(true);
    setNote3d(null);
    try {
      const r = await fetch(`/api/public/parking/${encodeURIComponent(token)}/3d`, { method: 'POST' });
      const j = (await r.json().catch(() => ({}))) as { remaining3d?: number; error?: string };
      if (!r.ok) return setNote3d(j.error ?? '3D isn’t available on this link.');
      setLeft3d(j.remaining3d ?? 0);
      setMode('3d');
    } catch {
      setNote3d('No connection — 3D needs a signal.');
    } finally {
      setOpening(false);
    }
  }, [token]);

  if (state.kind === 'loading') return <main className="pd-page pd-centre">Opening the parking map…</main>;
  if (state.kind === 'error')
    return (
      <main className="pd-page pd-centre">
        <h1 className="pd-title">Parking map</h1>
        <p>{state.message}</p>
      </main>
    );

  const d = state.data;
  const m = d.map;
  const satellite = m.view.satellite !== false;
  const gates = m.items.filter((i) => i.kind === 'marker' && (i.type === 'gate' || i.type === 'load_in'));
  const targets = gates.length
    ? gates.map((g) => ({ name: g.kind === 'marker' ? g.label || markerSpec(g.type)?.label || 'Gate' : 'Gate', at: toLatLng(m.anchor, g as { x: number; y: number }) }))
    : [{ name: d.venue.name ?? 'Venue', at: m.anchor }];
  const vehicles = m.items.filter((i) => i.kind === 'vehicle');
  const warnings = headroomWarnings(m.items, drawings);
  const frame = printFrame(m.items, m.view, { w: 800, h: 600 }, 'auto');
  const when = new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const ends = new Date(d.expiresAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <main className="pd-page">
      <header className="pd-head">
        <h1 className="pd-title">Parking · {d.venue.name ?? 'Venue'}</h1>
        <span className="pd-muted">
          {when}
          {d.venue.city ? ` · ${d.venue.city}` : ''}
          {d.label ? ` · for ${d.label}` : ''} · link ends {ends}
        </span>
      </header>

      <div className="pd-modes" role="group" aria-label="View">
        <button type="button" aria-pressed={mode === 'plan'} onClick={() => setMode('plan')}>
          {mode === '3d' ? <ArrowLeft size={14} aria-hidden /> : null} Plan
        </button>
        <button type="button" aria-pressed={mode === '3d'} disabled={opening || (mode !== '3d' && left3d <= 0)} onClick={() => mode !== '3d' && void open3d()}>
          <Box size={14} aria-hidden /> {opening ? 'Opening 3D…' : mode === '3d' ? '3D' : left3d > 0 ? `Look around in 3D (${left3d} left)` : '3D used up'}
        </button>
      </div>
      {note3d ? <p className="pd-note">{note3d}</p> : null}

      <section className="pd-stage">
        {mode === '3d' ? (
          <div className="pk-map" data-mode="3d" style={{ height: '100%' }}>
            <Parking3D
              anchor={m.anchor}
              items={m.items}
              drawings={drawings}
              floors={floors}
              satellite={satellite}
              fallback={{ centre: { x: frame.cx, y: frame.cy }, extent: Math.max(frame.wM, frame.hM) * 0.7, rotation: m.view.rotation }}
              cam3d={undefined}
              canEdit={false}
              pageTitle={null}
              atLimit
              onAddPage={() => {}}
              onSaveToPage={() => {}}
            />
          </div>
        ) : (
          <ParkingViewer anchor={m.anchor} view0={m.view} items={m.items} drawings={drawings} rasters={rasters} satellite={satellite} />
        )}
      </section>

      {warnings.length ? (
        <section className="pd-sec pd-warn" role="alert">
          <h2><TriangleAlert size={14} aria-hidden /> Headroom</h2>
          <ul>
            {warnings.map((w) => (
              <li key={w.text}>{w.text}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="pd-sec">
        <h2>Get there</h2>
        {targets.map((t) => {
          const u = navigateUrls(t.at);
          return (
            <div key={`${t.name}${t.at.lat}`} className="pd-target">
              <b>{t.name}</b>
              <span className="pd-links">
                <a className="pd-nav" href={u.google} target="_blank" rel="noopener noreferrer"><Navigation size={13} aria-hidden /> Google Maps</a>
                <a className="pd-nav" href={u.waze} target="_blank" rel="noopener noreferrer">Waze</a>
                <a className="pd-nav" href={u.apple} target="_blank" rel="noopener noreferrer">Apple Maps</a>
              </span>
            </div>
          );
        })}
      </section>

      {vehicles.length ? (
        <section className="pd-sec">
          <h2>Vehicles</h2>
          <ul className="pd-list">
            {vehicles.map((v) =>
              v.kind === 'vehicle' ? (
                <li key={v.id}>
                  <span className="pd-swatch" style={{ background: vehicleColour(LIVE_PALETTE, v) }} aria-hidden />
                  <b>{v.label || vehicleSpec(v.type)?.short}</b>
                  <span className="pd-muted">
                    {vehicleSpec(v.type)?.label} · {v.length} × {v.width} × {v.height} m
                  </span>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      ) : null}

      {m.notes.trim() ? (
        <section className="pd-sec">
          <h2>Notes</h2>
          <p className="pd-notes">{m.notes}</p>
        </section>
      ) : null}

      <footer className="pd-muted pd-foot">
        Shared from Lowpass · sizes are true{satellite ? ' · imagery Google' : ''}
        {drawings.length ? ' · drawings: the venue’s' : ''}
      </footer>
    </main>
  );
}
