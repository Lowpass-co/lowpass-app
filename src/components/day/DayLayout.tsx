'use client';

/* ============================================================
   LOWPASS — <DayLayout> (D1-6 C · the Daysheets-style Day)

   Three-zone Day surface adapted to OUR design system (tokens, hairlines,
   condensed caps) — NOT a clone of the reference:
     - LEFT  date rail: every tour day, day-type color bar, day-type · venue ·
       city, search (city/venue/date), Today pinned, Day/Routing view toggle.
     - CENTER hero + Schedule: the money-grammar hero (eyebrow · city headline ·
       venue subline · day-type chip · fact chips) above the dominant schedule
       column — time · item rows, 15px type, approx chip, source tag, Edit
       affordance (TM).
     - RIGHT stacked cards: Day Type & Locations · Lodging (check-in/out +
       occupant chips) · Flights (route + passenger chips) · Files (day-linked
       documents) · Notes · Contacts.

   The blocks render from the DayObject, which is SLICE-FILTERED server-side, so
   out-of-slice cards (money/notes) simply aren't present — the token/crew view
   shares this exact component. A block renders only when it has content or an
   invitation (no dead boxes).
   ============================================================ */

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { FileText, Image as ImageIcon, File as FileIcon } from 'lucide-react';
import type { DayObject, ScheduleItem, DayHotel, DayContact, DayFlight, DayFile } from '@/lib/day/loadDay';
import { DayRail, type RailDay } from './DayRail';

/* R5-2 — RailDay + the rail itself now live in <DayRail>, which wraps the
   canonical <RoutingRail>. Re-exported here so the two page mounts
   (operations/day/[routingId] and m/day/[token]) keep their existing import. */
export type { RailDay };

function dayTypeColor(t: string | null): string {
  if (t === 'show' || t === 'festival') return 'var(--lp-day-show)';
  if (t === 'travel') return 'var(--lp-day-travel)';
  return 'var(--lp-day-off)';
}
function fmtLong(iso: string | null): string {
  if (!iso) return 'Date TBC';
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function fmtClock(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}
function mapsHref(address: string | null, name: string | null): string | null {
  const q = [name, address].filter(Boolean).join(', ').trim();
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

const DAY_TYPE_LABEL: Record<string, string> = {
  show: 'Show', festival: 'Festival', travel: 'Travel', off: 'Off', rehearsal: 'Rehearsal', press: 'Press', radio: 'Radio', tv: 'TV',
};

const card: React.CSSProperties = { border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-lg)', background: 'var(--lp-panel)', padding: 'var(--lp-space-4)' };
function CardTitle({ children }: { children: ReactNode }) {
  return <h3 className="lp-label-caps" style={{ margin: '0 0 8px', fontSize: 10, letterSpacing: 'var(--lp-tracking-caps)', color: 'var(--lp-text-tertiary)' }}>{children}</h3>;
}

/* ---- center schedule ------------------------------------------------------ */
function Schedule({ schedule, editHref }: { schedule: DayObject['schedule']; editHref?: string }) {
  if (schedule === undefined) return null;
  return (
    <section style={{ ...card, minHeight: 240 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <CardTitle>Schedule</CardTitle>
        {editHref ? <Link href={editHref} style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--color-lp-orange)' }}>Edit</Link> : null}
      </div>
      {!schedule || schedule.length === 0 ? (
        <p style={{ margin: 0, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)' }}>No calls or times yet.</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
          {schedule.map((s: ScheduleItem, i) => (
            <li key={i} style={{ display: 'grid', gridTemplateColumns: '78px 1fr auto', gap: 12, alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid var(--lp-border-subtle)' }}>
              <span className="lp-mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--lp-text)', whiteSpace: 'nowrap' }}>
                {s.approx && s.time ? '~' : ''}{s.time ?? '—'}
              </span>
              <span style={{ fontSize: 15, color: 'var(--lp-text)' }}>
                {s.label}
                {s.detail ? <span style={{ color: 'var(--lp-text-tertiary)', fontSize: 13 }}> · {s.detail}</span> : null}
              </span>
              <span className="lp-label-caps" style={{ fontSize: 8, color: 'var(--lp-text-tertiary)', alignSelf: 'center' }}>{s.source === 'labor_call' ? 'Call' : 'Advance'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---- right cards ---------------------------------------------------------- */
function LocationsCard({ day }: { day: DayObject }) {
  if (day.venue === undefined) return null;
  const v = day.venue;
  const href = v ? mapsHref(v.address, v.name) : null;
  return (
    <section style={card}>
      <CardTitle>Day Type &amp; Locations</CardTitle>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ height: 8, width: 8, borderRadius: 999, background: dayTypeColor(day.dayType) }} aria-hidden />
        <span className="lp-label-caps" style={{ fontSize: 10, color: 'var(--lp-text-secondary)' }}>{DAY_TYPE_LABEL[day.dayType ?? ''] ?? (day.dayType ?? 'Day')}</span>
      </div>
      {v && v.name ? (
        <div style={{ display: 'grid', gap: 3 }}>
          <div style={{ fontSize: 'var(--lp-text-base)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' }}>{v.name}</div>
          {v.address ? <div style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>{v.address}</div> : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>
            {v.phone ? <a href={`tel:${v.phone}`} style={{ color: 'inherit' }}>{v.phone}</a> : null}
            {v.capacity != null ? <span>Cap. {v.capacity.toLocaleString()}</span> : null}
            {href ? <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--color-lp-orange)' }}>Map ↗</a> : null}
          </div>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)' }}>No venue set.</p>
      )}
    </section>
  );
}

function LodgingCard({ hotels }: { hotels: DayObject['hotels'] }) {
  if (hotels === undefined) return null;
  if (!hotels || hotels.length === 0) return null; // no dead box
  return (
    <section style={card}>
      <CardTitle>Lodging</CardTitle>
      <div style={{ display: 'grid', gap: 14 }}>
        {hotels.map((h: DayHotel, i) => {
          const href = mapsHref(h.address, h.name);
          return (
            <div key={i} style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 'var(--lp-text-base)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' }}>{h.name}</div>
              {h.address ? <div style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>{h.address}</div> : null}
              <div style={{ display: 'flex', gap: 16 }}>
                <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>Check-in<br /><span className="lp-mono" style={{ fontSize: 13, color: 'var(--lp-text)' }}>{h.checkInAt ? fmtClock(h.checkInAt) : '—'}</span></span>
                <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>Check-out<br /><span className="lp-mono" style={{ fontSize: 13, color: 'var(--lp-text)' }}>{h.checkOutAt ? fmtClock(h.checkOutAt) : '—'}</span></span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>
                {h.confirmationNumber ? <span>Conf. {h.confirmationNumber}</span> : null}
                {h.phone ? <a href={`tel:${h.phone}`} style={{ color: 'inherit' }}>{h.phone}</a> : null}
                {href ? <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--color-lp-orange)' }}>Map ↗</a> : null}
              </div>
              {h.occupants.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                  {h.occupants.map((name, j) => (
                    <span key={j} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--lp-surface)', border: '1px solid var(--lp-border)', color: 'var(--lp-text-secondary)' }}>{name}</span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FlightsCard({ flights }: { flights: DayObject['flights'] }) {
  if (flights === undefined) return null; // slice-gated: absent for accountant
  if (!flights || flights.length === 0) return null; // no dead box
  return (
    <section style={card}>
      <CardTitle>Flights</CardTitle>
      <div style={{ display: 'grid', gap: 14 }}>
        {flights.map((f: DayFlight, i) => (
          <div key={i} style={{ display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span className="lp-mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--lp-text)', whiteSpace: 'nowrap' }}>{fmtClock(f.departAt) || '—'}</span>
              <span style={{ fontSize: 'var(--lp-text-base)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' }}>{f.from} → {f.to}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>
              {[f.airline, f.flightNumber].filter(Boolean).length ? <span>{[f.airline, f.flightNumber].filter(Boolean).join(' ')}</span> : null}
              {f.arriveAt ? <span>arr <span className="lp-mono" style={{ color: 'var(--lp-text-secondary)' }}>{fmtClock(f.arriveAt)}</span></span> : null}
              {f.confirmation ? <span>Conf. {f.confirmation}</span> : f.pnr ? <span>PNR {f.pnr}</span> : null}
            </div>
            {(f.passengers ?? []).length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                {(f.passengers ?? []).map((name, j) => (
                  <span key={j} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--lp-surface)', border: '1px solid var(--lp-border)', color: 'var(--lp-text-secondary)' }}>{name}</span>
                ))}
              </div>
            ) : null}
            {f.notes ? <div style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>{f.notes}</div> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

const FILE_GLYPH: Record<DayFile['kind'], typeof FileIcon> = { pdf: FileText, image: ImageIcon, other: FileIcon };
function FilesCard({ files }: { files: DayObject['files'] }) {
  if (files === undefined) return null; // slice-gated: absent for driver/accountant
  if (!files || files.length === 0) return null; // no dead box
  return (
    <section style={card}>
      <CardTitle>Files</CardTitle>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
        {files.map((f: DayFile, i) => {
          const Glyph = FILE_GLYPH[f.kind];
          return (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Glyph aria-hidden style={{ height: 14, width: 14, flexShrink: 0, color: 'var(--lp-text-tertiary)' }} />
              <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{f.name}</span>
              {f.url ? (
                <a href={f.url} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontSize: 'var(--lp-text-xs)', color: 'var(--color-lp-orange)', whiteSpace: 'nowrap' }}>Open ↗</a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NotesCard({ notes }: { notes: DayObject['notes'] }) {
  if (notes === undefined) return null; // slice-gated: absent for crew/driver/band
  if (!notes) return null;
  return (
    <section style={card}>
      <CardTitle>Notes</CardTitle>
      <NoteBody body={notes} />
    </section>
  );
}
function NoteBody({ body }: { body: string }) {
  const [open, setOpen] = useState(false);
  const long = body.length > 220;
  const shown = open || !long ? body : `${body.slice(0, 220)}…`;
  return (
    <div>
      <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>{shown}</p>
      {long ? <button type="button" onClick={() => setOpen((o) => !o)} style={{ marginTop: 4, border: 0, background: 'transparent', color: 'var(--color-lp-orange)', fontSize: 'var(--lp-text-xs)', cursor: 'pointer', padding: 0 }}>{open ? 'Less' : 'Read more'}</button> : null}
    </div>
  );
}

function ContactsCard({ contacts, advanceHref }: { contacts: DayObject['contacts']; advanceHref?: string }) {
  if (contacts === undefined) return null;
  const empty = !contacts || contacts.length === 0;
  if (empty && !advanceHref) return null; // token view: no dead box, no link
  return (
    <section style={card}>
      <CardTitle>Day-of contacts</CardTitle>
      {empty ? (
        <p style={{ margin: 0, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)' }}>
          No day-of contacts yet — they land here from the advance <a href={advanceHref} style={{ color: 'var(--color-lp-orange)' }}>→</a>
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {contacts.map((c: DayContact, i) => (
            <li key={i} style={{ display: 'grid', gap: 2 }}>
              <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>{c.name} <span style={{ color: 'var(--lp-text-tertiary)' }}>· {c.role}</span></span>
              <span style={{ display: 'flex', gap: 12, fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>
                {c.phone ? <a href={`tel:${c.phone}`} style={{ color: 'inherit' }}>{c.phone}</a> : null}
                {c.email ? <a href={`mailto:${c.email}`} style={{ color: 'inherit' }}>{c.email}</a> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---- hero ----------------------------------------------------------------- */
/** Money-grammar hero (the SettlementWalkClient WalkPanel pattern): eyebrow ·
 *  19px city headline · venue subline · day-type chip · fact-chip strip. Every
 *  fact renders ONLY from blocks present on the slice-filtered DayObject — an
 *  undefined field contributes nothing (the crew/token guarantee). */
function DayHero({ day, actions }: { day: DayObject; actions?: ReactNode }) {
  const hue = dayTypeColor(day.dayType);
  const eyebrow = [fmtLong(day.date), [day.artistName, day.tourName].filter(Boolean).join(' · ')].filter(Boolean).join(' · ');
  const scheduleCount = day.schedule?.length ?? 0;
  const firstCall = (day.schedule ?? []).find((s) => s.time);
  const hotelName = day.hotels?.[0]?.name ?? null;
  const flightCount = day.flights?.length ?? 0;

  const facts: ReactNode[] = [];
  const fact = (key: string, body: ReactNode) => (
    <span key={key} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, border: '1px solid var(--lp-border)', borderRadius: 999, padding: '3px 10px', background: 'var(--lp-panel)', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)', whiteSpace: 'nowrap' }}>
      {body}
    </span>
  );
  if (day.schedule !== undefined && scheduleCount > 0) {
    facts.push(fact('schedule', <>{scheduleCount} schedule item{scheduleCount === 1 ? '' : 's'}</>));
  }
  if (firstCall?.time) {
    facts.push(fact('call', <>First call <span className="lp-mono" style={{ color: 'var(--lp-text)', fontWeight: 600 }}>{firstCall.approx ? '~' : ''}{firstCall.time}</span></>));
  }
  if (hotelName) facts.push(fact('hotel', <>{hotelName}</>));
  if (day.flights !== undefined && flightCount > 0) {
    facts.push(fact('flights', <>{flightCount} flight{flightCount === 1 ? '' : 's'}</>));
  }

  return (
    <header
      style={{
        borderRadius: 'var(--lp-radius-lg)', border: '1px solid var(--lp-border)',
        background: `linear-gradient(180deg, color-mix(in srgb, ${hue} 8%, var(--lp-surface)) 0%, var(--lp-surface) 100%)`,
        padding: '16px 20px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--lp-text-tertiary)', marginBottom: 2 }}>
            {eyebrow || '—'}
          </div>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 750, letterSpacing: '-0.01em', color: 'var(--lp-text)' }}>
            {day.city || day.venue?.name || fmtLong(day.date)}
          </h1>
          {day.venue?.name && day.city ? (
            <div style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>{day.venue.name}</div>
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${hue}`, borderRadius: 999, padding: '3px 10px' }}>
            <span style={{ height: 7, width: 7, borderRadius: 999, background: hue }} aria-hidden />
            <span className="lp-label-caps" style={{ fontSize: 9, color: 'var(--lp-text-secondary)' }}>{DAY_TYPE_LABEL[day.dayType ?? ''] ?? (day.dayType ?? 'Day')}</span>
          </span>
          {actions}
        </div>
      </div>
      {facts.length > 0 || day.pnl ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 }}>
          {facts}
          <PnlChip pnl={day.pnl} />
        </div>
      ) : null}
    </header>
  );
}

/* ---- money chip (slice-gated) --------------------------------------------- */
function PnlChip({ pnl }: { pnl: DayObject['pnl'] }) {
  if (!pnl) return null;
  const fmt = (n: number | null) => (n == null ? '—' : `${pnl.currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
  return (
    <div style={{ display: 'inline-flex', gap: 14, alignItems: 'baseline', border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', padding: '5px 12px', background: 'var(--lp-surface)' }}>
      <span className="lp-label-caps" style={{ fontSize: 9, color: 'var(--lp-text-tertiary)' }}>Day P&amp;L</span>
      <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>Gtee <span className="lp-mono" style={{ color: 'var(--lp-text)' }}>{fmt(pnl.guarantee)}</span></span>
      <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>Net <span className="lp-mono" style={{ color: 'var(--lp-text)' }}>{fmt(pnl.showNet)}</span></span>
    </div>
  );
}

export interface DayLayoutProps {
  day: DayObject;
  railDays: RailDay[];
  today: string;
  actions?: ReactNode;
  advanceHref?: string;
  editHref?: string;
  routingHref?: string;
}

export function DayLayout({ day, railDays, today, actions, advanceHref, editHref, routingHref }: DayLayoutProps) {
  return (
    <div className="lp-day-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 260px) minmax(0, 1fr) minmax(260px, 320px)', gap: 'var(--lp-space-4)', alignItems: 'start' }}>
      <DayRail days={railDays} activeId={day.routingId} today={today} routingHref={routingHref} />

      {/* center */}
      <div style={{ display: 'grid', gap: 'var(--lp-space-4)', minWidth: 0 }}>
        <DayHero day={day} actions={actions} />
        <Schedule schedule={day.schedule} editHref={editHref} />
      </div>

      {/* right */}
      <div style={{ display: 'grid', gap: 'var(--lp-space-4)' }}>
        <LocationsCard day={day} />
        <LodgingCard hotels={day.hotels} />
        <FlightsCard flights={day.flights} />
        <FilesCard files={day.files} />
        <NotesCard notes={day.notes} />
        <ContactsCard contacts={day.contacts} advanceHref={advanceHref} />
      </div>

      <style>{`@media (max-width: 900px){ .lp-day-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
