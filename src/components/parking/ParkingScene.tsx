/* ============================================
   <ParkingScene> — THE drawing of a parking map (Nov 2026, Adam)

   One renderer for the editor AND the PDF: the editor passes live CSS-token
   colours and pointer handlers; the export passes resolved colours, tiles as
   data URLs and a label scale, then rasterises the same SVG. Two drawings of
   one map would drift; this can't.

   Everything to scale (vehicles, areas, routes, measures) is projected from
   the ground frame through geo.project(), so a bus is length × ppm pixels
   long at any zoom and rotation. Chips and labels stay a constant size.
   Imagery tiles sit in one transformed group (sceneTransform).
   ============================================ */

import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { DoorOpen, PlugZap, Fence, ArrowUpFromLine, Droplet, Trash2, ShieldCheck, StickyNote, type LucideIcon } from 'lucide-react';
import { bearing, dist, fmtMetres, niceLength, project, sceneTransform, unproject, type Pt, type View } from '@/lib/parking/geo';
import { markerSpec, vehicleSpec, areaLabel, type MarkerType } from '@/lib/parking/catalogue';
import { pathLength, vehicleCorners, type ParkingItem, type VehicleItem } from '@/lib/parking/model';
import { vehicleParts, type Part, type PartKind } from '@/lib/parking/silhouettes';
import { areaColour, vehicleColour, type Palette } from './palette';

export interface SceneTile {
  id: string;
  href: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A venue drawing's raster, placed: `matrix` maps its source units to scene
 *  coordinates (drawings.ts svgMatrix); x / y / w / h is its crop. */
export interface SceneDrawing {
  id: string;
  href: string;
  matrix: [number, number, number, number, number, number];
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  /** Lines on the satellite (white paper multiplied away), or the dark copy as is. */
  blend: 'multiply' | 'normal';
}

export interface Draft {
  kind: 'route' | 'area' | 'measure';
  points: Pt[];
  cursor: Pt | null;
}

export const MARKER_ICON: Record<MarkerType, LucideIcon> = {
  load_in: DoorOpen,
  shore_power: PlugZap,
  gate: Fence,
  height_limit: ArrowUpFromLine,
  water: Droplet,
  dump: Trash2,
  security: ShieldCheck,
  note: StickyNote,
};

export function ParkingScene({
  view,
  width,
  height,
  items,
  tiles,
  palette: p,
  selectedIds = [],
  drawings = [],
  fadedIds,
  warnIds,
  draft = null,
  grid = false,
  labelScale = 1,
  fontFamily = 'var(--font-sans)',
  onItemDown,
  onHandleDown,
  onBackgroundDown,
  children,
}: {
  view: View;
  width: number;
  height: number;
  items: ParkingItem[];
  tiles: SceneTile[];
  palette: Palette;
  /** Highlighted items; the turn knob shows only when exactly one is picked. */
  selectedIds?: readonly string[];
  /** Venue drawings, under everything drawn (live only: the PDF paints them on its canvas). */
  drawings?: SceneDrawing[];
  /** Items on another level: shown faint, can't be picked. */
  fadedIds?: ReadonlySet<string>;
  /** Vehicles that fail a headroom check: outlined in the no-go colour. */
  warnIds?: ReadonlySet<string>;
  draft?: Draft | null;
  grid?: boolean;
  labelScale?: number;
  /** Live: the CSS token. Export: the resolved family (a rasterised SVG can't read CSS). */
  fontFamily?: string;
  onItemDown?: (e: ReactPointerEvent, item: ParkingItem) => void;
  onHandleDown?: (e: ReactPointerEvent, item: ParkingItem, handle: string) => void;
  onBackgroundDown?: (e: ReactPointerEvent) => void;
  children?: ReactNode;
}) {
  const P = (pt: Pt) => project(view, width, height, pt);
  const isSel = (id: string) => selectedIds.includes(id);
  const single = selectedIds.length === 1;
  const pts = (list: Pt[]) => list.map((q) => { const s = P(q); return `${s.x.toFixed(2)},${s.y.toFixed(2)}`; }).join(' ');
  const ls = labelScale;
  const interactive = !!onItemDown;
  const halo = { paintOrder: 'stroke' as const, stroke: p.halo, strokeWidth: 3 * ls, strokeLinejoin: 'round' as const };

  const down = (item: ParkingItem) => (interactive ? (e: ReactPointerEvent) => onItemDown!(e, item) : undefined);
  const cursor = interactive ? 'move' : undefined;
  const ghosts = fadedIds?.size ? items.filter((i) => fadedIds.has(i.id)) : [];
  const live = ghosts.length ? items.filter((i) => !fadedIds!.has(i.id)) : items;

  const layer = (list: ParkingItem[], live: boolean) => {
    const dn = live ? down : () => undefined;
  const areas = list.filter((i) => i.kind === 'area');
  const routes = list.filter((i) => i.kind === 'route');
  const vehicles = list.filter((i): i is VehicleItem => i.kind === 'vehicle');
  const markers = list.filter((i) => i.kind === 'marker');
  const measures = list.filter((i) => i.kind === 'measure');


    return (
      <>
        {areas.map((a) => {
          if (a.kind !== 'area') return null;
          const c = areaColour(p, a.type);
          const centre = P({ x: a.points.reduce((s, q) => s + q.x, 0) / a.points.length, y: a.points.reduce((s, q) => s + q.y, 0) / a.points.length });
          return (
            <g key={a.id}>
              <polygon
                points={pts(a.points)}
                fill={c}
                fillOpacity={0.28}
                stroke={c}
                strokeWidth={2 * ls}
                strokeDasharray={a.type === 'no_go' ? `${6 * ls} ${4 * ls}` : undefined}
                onPointerDown={dn(a)}
                style={{ cursor: live ? cursor : undefined }}
              />
              {isSel(a.id) ? <polygon points={pts(a.points)} fill="none" stroke={p.select} strokeWidth={2} strokeDasharray="4 3" pointerEvents="none" /> : null}
              <Label x={centre.x} y={centre.y} ls={ls} p={p} halo={halo} text={a.label || areaLabel(a.type)} />
            </g>
          );
        })}

        {routes.map((r) => (r.kind === 'route' ? <RoutePath key={r.id} points={r.points.map(P)} p={p} ls={ls} selected={isSel(r.id)} label={r.label} onDown={dn(r)} cursor={live ? cursor : undefined} halo={halo} /> : null))}

        {vehicles.map((v) => {
          const spec = vehicleSpec(v.type);
          const fill = vehicleColour(p, v);
          const body = vehicleCorners(v).map(P);
          const c = P(v);
          const sel = isSel(v.id);
          const h = (v.heading * Math.PI) / 180;
          const fwd = { x: Math.sin(h), y: Math.cos(h) };
          const nose = { x: v.x + fwd.x * (v.length / 2), y: v.y + fwd.y * (v.length / 2) };
          const front = P(nose);
          const knob = P({ x: nose.x + fwd.x * 3, y: nose.y + fwd.y * 3 });
          // Vehicle frame → screen: x across (right +), y back from the nose, metres.
          const right = P({ x: nose.x + fwd.y, y: nose.y - fwd.x });
          const back = P({ x: nose.x - fwd.x, y: nose.y - fwd.y });
          const matrix = `matrix(${right.x - front.x} ${right.y - front.y} ${back.x - front.x} ${back.y - front.y} ${front.x} ${front.y})`;
          return (
            <g key={v.id}>
              <g transform={matrix} pointerEvents="none">
                {vehicleParts(v.type, v.length, v.width).map((part, i) => (
                  <VehiclePart key={i} part={part} fill={fill} p={p} ls={ls} />
                ))}
              </g>
              {/* The whole footprint is the handle, trailer and all. */}
              <polygon points={body.map((q) => `${q.x},${q.y}`).join(' ')} fill="transparent" stroke="none" onPointerDown={dn(v)} style={{ cursor: live ? cursor : undefined }} />
              {sel ? (
                <>
                  <polygon points={body.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={p.select} strokeWidth={2.5} strokeDasharray="5 3" pointerEvents="none" />
                  {live && onHandleDown && single ? (
                    <>
                      <line x1={front.x} y1={front.y} x2={knob.x} y2={knob.y} stroke={p.select} strokeWidth={1.5} pointerEvents="none" />
                      <circle cx={knob.x} cy={knob.y} r={7} fill={p.select} stroke={p.halo} strokeWidth={1.5} style={{ cursor: 'grab' }} onPointerDown={(e) => onHandleDown(e, v, 'rotate')} aria-label="Turn" />
                    </>
                  ) : null}
                </>
              ) : null}
              {warnIds?.has(v.id) ? (
                <polygon points={body.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={p['area-no-go']} strokeWidth={3} pointerEvents="none" />
              ) : null}
              <VehicleLabel c={c} front={front} widthPx={v.width * Math.hypot(right.x - front.x, right.y - front.y)} ls={ls} p={p} halo={halo} name={v.label || spec?.short || 'Vehicle'} length={fmtMetres(v.length)} />
            </g>
          );
        })}

        {measures.map((m) => {
          if (m.kind !== 'measure') return null;
          const a = P(m.a);
          const b = P(m.b);
          return (
            <g key={m.id}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={p.halo} strokeWidth={4 * ls} strokeLinecap="round" pointerEvents="none" />
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={p.measure} strokeWidth={2 * ls} strokeDasharray={`${6 * ls} ${4 * ls}`} onPointerDown={dn(m)} style={{ cursor: live ? cursor : undefined }} />
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={14} onPointerDown={dn(m)} style={{ cursor: live ? cursor : undefined }} />
              {[a, b].map((s, i) => (
                <circle key={i} cx={s.x} cy={s.y} r={3.5 * ls} fill={p.measure} stroke={p.halo} strokeWidth={1.5} onPointerDown={live && onHandleDown ? (e) => onHandleDown(e, m, i ? 'b' : 'a') : undefined} style={{ cursor: live && onHandleDown ? 'grab' : undefined }} />
              ))}
              {isSel(m.id) ? <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={p.select} strokeOpacity={0.5} strokeWidth={8} pointerEvents="none" /> : null}
              <Label x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 12 * ls} ls={ls} p={p} halo={halo} text={fmtMetres(dist(m.a, m.b))} />
            </g>
          );
        })}

        {markers.map((m, idx) => {
          if (m.kind !== 'marker') return null;
          const s = P(m);
          const Icon = MARKER_ICON[m.type];
          const r = 13 * ls;
          const name = m.label || markerSpec(m.type)?.label || '';
          // Label on the right unless another marker sits there — then on the left.
          const reach = r * 2 + Math.max(name.length, m.detail.length) * 6.5 * ls;
          const crowded = markers.some((o, j) => {
            if (j === idx || o.kind !== 'marker') return false;
            const q = P(o);
            return q.x > s.x && q.x - s.x < reach && Math.abs(q.y - s.y) < r * 2.2;
          });
          const tx = crowded ? s.x - r - 5 * ls : s.x + r + 5 * ls;
          const anchor = crowded ? 'end' : 'start';
          return (
            <g key={m.id} onPointerDown={dn(m)} style={{ cursor: live ? cursor : undefined }}>
              <circle cx={s.x} cy={s.y} r={r} fill={p.chip} stroke={isSel(m.id) ? p.select : p.ink} strokeWidth={(isSel(m.id) ? 2.5 : 1.5) * ls} />
              <Icon x={s.x - r * 0.62} y={s.y - r * 0.62} width={r * 1.24} height={r * 1.24} color={p.ink} strokeWidth={2} />
              <text x={tx} textAnchor={anchor} y={s.y + (m.detail ? -1 * ls : 4 * ls)} fontSize={12 * ls} fontWeight={600} fill={p.ink} style={halo}>
                {name}
              </text>
              {m.detail ? (
                <text x={tx} textAnchor={anchor} y={s.y + 12 * ls} fontSize={10.5 * ls} fill={p.ink} style={halo}>
                  {m.detail}
                </text>
              ) : null}
            </g>
          );
        })}
      </>
    );
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', touchAction: 'none', userSelect: 'none' }}
      fontFamily={fontFamily}
    >
      <rect width={width} height={height} fill={p.blank} onPointerDown={onBackgroundDown} />
      <g transform={sceneTransform(view, width, height)} pointerEvents="none">
        {tiles.map((t) => (
          // A hair of overlap hides antialiasing seams between tiles.
          <image key={t.id} href={t.href} x={t.x} y={t.y} width={t.w * 1.002} height={t.h * 1.002} preserveAspectRatio="none" />
        ))}
        {drawings.map((d) => (
          <g key={d.id} transform={`matrix(${d.matrix.join(' ')})`}>
            <image href={d.href} x={d.x} y={d.y} width={d.w} height={d.h} preserveAspectRatio="none" opacity={d.opacity} style={{ mixBlendMode: d.blend }} />
          </g>
        ))}
      </g>
      {grid ? <Grid view={view} width={width} height={height} colour={p.grid} /> : null}

      {ghosts.length ? (
        <g opacity={0.28} pointerEvents="none">
          {layer(ghosts, false)}
        </g>
      ) : null}
      {layer(live, true)}

      {draft ? <DraftShape draft={draft} P={P} p={p} /> : null}
      {children}
    </svg>
  );
}

function Label({ x, y, text, sub, ls, p, halo }: { x: number; y: number; text: string; sub?: string; ls: number; p: Palette; halo: object }) {
  return (
    <g pointerEvents="none">
      <text x={x} y={sub ? y - 1 * ls : y + 4 * ls} textAnchor="middle" fontSize={12 * ls} fontWeight={700} fill={p.ink} style={halo}>
        {text}
      </text>
      {sub ? (
        <text x={x} y={y + 11 * ls} textAnchor="middle" fontSize={10 * ls} fill={p.ink} style={halo}>
          {sub}
        </text>
      ) : null}
    </g>
  );
}

/** Written ALONG the vehicle (as on a hand-drawn plan), kept upright, so
 *  buses parked side by side don't stack their labels on each other. */
const PART_PAINT: Record<PartKind, { base: boolean; shade: number; ink?: number; outline: boolean }> = {
  body: { base: true, shade: 0, outline: true },
  cab: { base: true, shade: 0.3, outline: true },
  hood: { base: true, shade: 0.18, outline: true },
  glass: { base: false, shade: 0.78, outline: false },
  roof: { base: false, shade: 0, ink: 0.38, outline: false },
  coupling: { base: false, shade: 0.9, outline: false },
  mirror: { base: false, shade: 0.9, outline: false },
  rib: { base: false, shade: 0.28, outline: false },
};

/** One part of a vehicle, drawn in the vehicle's own frame (metres). */
function VehiclePart({ part, fill, p, ls }: { part: Part; fill: string; p: Palette; ls: number }) {
  const paint = PART_PAINT[part.kind];
  const box = { x: (part.s ?? 0) - part.w / 2, y: part.f0, width: part.w, height: Math.max(0.01, part.f1 - part.f0), rx: part.r ?? 0 };
  return (
    <>
      {paint.base ? <rect {...box} fill={fill} fillOpacity={0.93} stroke={paint.outline ? p.halo : 'none'} strokeWidth={1.3 * ls} vectorEffect="non-scaling-stroke" /> : null}
      {paint.shade ? <rect {...box} fill={p.halo} fillOpacity={paint.shade} /> : null}
      {paint.ink ? <rect {...box} fill={p.ink} fillOpacity={paint.ink} /> : null}
    </>
  );
}

/** Written ALONG the vehicle (as on a hand-drawn plan), kept upright, so
 *  buses parked side by side don't stack their labels on each other. A name
 *  that won't fit inside sits alongside instead of spilling over the ends. */
function VehicleLabel({ c, front, widthPx, name, length, ls, p, halo }: { c: Pt; front: Pt; widthPx: number; name: string; length: string; ls: number; p: Palette; halo: object }) {
  let a = (Math.atan2(front.y - c.y, front.x - c.x) * 180) / Math.PI;
  if (a > 90) a -= 180;
  if (a < -90) a += 180;
  const room = 2 * Math.hypot(front.x - c.x, front.y - c.y) * 0.92;
  const fit = (t: string) => Math.min(11 * ls, room / (t.length * 0.6));
  const full = `${name} · ${length}`;
  const inside = fit(full) >= 8 * ls ? full : fit(name) >= 7 * ls ? name : null;
  const text = inside ?? full;
  const size = inside ? Math.max(7 * ls, fit(text)) : 10 * ls;
  // Outside: shift across the vehicle (perpendicular to its axis), clear of its side.
  const rad = (a * Math.PI) / 180;
  const off = inside ? 0 : widthPx / 2 + size * 0.9;
  const x = c.x - Math.sin(rad) * off;
  const y = c.y + Math.cos(rad) * off;
  return (
    <text
      x={x}
      y={y}
      transform={`rotate(${a.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})`}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={size}
      fontWeight={700}
      fill={p.ink}
      style={halo}
      pointerEvents="none"
    >
      {text}
    </text>
  );
}

function arrowHead(at: Pt, from: Pt, size: number): string {
  const a = Math.atan2(at.y - from.y, at.x - from.x);
  const l = { x: at.x - size * Math.cos(a - 0.45), y: at.y - size * Math.sin(a - 0.45) };
  const r = { x: at.x - size * Math.cos(a + 0.45), y: at.y - size * Math.sin(a + 0.45) };
  return `${l.x},${l.y} ${at.x},${at.y} ${r.x},${r.y}`;
}

function RoutePath({
  points,
  p,
  ls,
  selected,
  label,
  onDown,
  cursor,
  halo,
}: {
  points: Pt[];
  p: Palette;
  ls: number;
  selected: boolean;
  label: string;
  onDown?: (e: ReactPointerEvent) => void;
  cursor?: string;
  halo: object;
}) {
  if (points.length < 2) return null;
  const d = points.map((s, i) => `${i ? 'L' : 'M'}${s.x.toFixed(2)} ${s.y.toFixed(2)}`).join(' ');
  // Arrows along the way (every segment's middle) and at the end.
  const mids = points.slice(1).map((b, i) => ({ a: points[i], b, m: { x: (points[i].x + b.x) / 2, y: (points[i].y + b.y) / 2 } }));
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const mid = mids[Math.floor(mids.length / 2)];
  return (
    <g>
      <path d={d} fill="none" stroke={p.halo} strokeWidth={8 * ls} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
      <path d={d} fill="none" stroke={p.route} strokeWidth={4.5 * ls} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
      <path d={d} fill="none" stroke="transparent" strokeWidth={16} onPointerDown={onDown} style={{ cursor }} />
      {mids.map((s, i) =>
        Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > 40 * ls ? (
          <polyline key={i} points={arrowHead({ x: s.m.x + (s.b.x - s.a.x) * 0.04, y: s.m.y + (s.b.y - s.a.y) * 0.04 }, s.a, 9 * ls)} fill="none" stroke={p.halo} strokeWidth={2.5 * ls} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
        ) : null,
      )}
      <polygon points={arrowHead(last, prev, 16 * ls)} fill={p.route} stroke={p.halo} strokeWidth={2 * ls} strokeLinejoin="round" pointerEvents="none" />
      {selected ? <path d={d} fill="none" stroke={p.select} strokeWidth={2} strokeDasharray="5 4" pointerEvents="none" /> : null}
      {label ? (
        <text x={mid.m.x} y={mid.m.y - 10 * ls} textAnchor="middle" fontSize={12 * ls} fontWeight={700} fill={p.ink} style={halo} pointerEvents="none">
          {label}
        </text>
      ) : null}
    </g>
  );
}

function DraftShape({ draft, P, p }: { draft: Draft; P: (q: Pt) => Pt; p: Palette }) {
  const all = draft.cursor ? [...draft.points, draft.cursor] : draft.points;
  if (!all.length) return null;
  const s = all.map(P);
  const str = s.map((q) => `${q.x},${q.y}`).join(' ');
  const colour = draft.kind === 'route' ? p.route : draft.kind === 'area' ? p['area-other'] : p.measure;
  const len = draft.kind === 'measure' && all.length === 2 ? dist(all[0], all[1]) : draft.kind === 'route' ? pathLength(all) : null;
  const last = s[s.length - 1];
  return (
    <g pointerEvents="none">
      {draft.kind === 'area' ? <polygon points={str} fill={colour} fillOpacity={0.2} stroke={colour} strokeWidth={2} strokeDasharray="5 4" /> : <polyline points={str} fill="none" stroke={colour} strokeWidth={3} strokeDasharray="6 4" />}
      {s.map((q, i) => (
        <circle key={i} cx={q.x} cy={q.y} r={4} fill={colour} stroke={p.halo} strokeWidth={1.5} />
      ))}
      {len != null && len > 0 ? (
        <text x={last.x + 10} y={last.y - 10} fontSize={12} fontWeight={700} fill={p.ink} style={{ paintOrder: 'stroke', stroke: p.halo, strokeWidth: 3 }}>
          {fmtMetres(len)}
          {draft.kind === 'measure' && all.length === 2 ? ` · ${Math.round(bearing(all[0], all[1]))}°` : ''}
        </text>
      ) : null}
    </g>
  );
}

/** A metre grid for when there is no imagery: round spacing, follows rotation. */
function Grid({ view, width, height, colour }: { view: View; width: number; height: number; colour: string }) {
  const step = niceLength(120 / view.ppm) || 10;
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ].map((s) => unproject(view, width, height, s));
  const minX = Math.floor(Math.min(...corners.map((c) => c.x)) / step) * step;
  const maxX = Math.ceil(Math.max(...corners.map((c) => c.x)) / step) * step;
  const minY = Math.floor(Math.min(...corners.map((c) => c.y)) / step) * step;
  const maxY = Math.ceil(Math.max(...corners.map((c) => c.y)) / step) * step;
  const lines: [Pt, Pt][] = [];
  for (let x = minX; x <= maxX && lines.length < 400; x += step) lines.push([{ x, y: minY }, { x, y: maxY }]);
  for (let y = minY; y <= maxY && lines.length < 800; y += step) lines.push([{ x: minX, y }, { x: maxX, y }]);
  return (
    <g pointerEvents="none">
      {lines.map(([a, b], i) => {
        const s = project(view, width, height, a);
        const e = project(view, width, height, b);
        return <line key={i} x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke={colour} strokeWidth={1} />;
      })}
    </g>
  );
}
