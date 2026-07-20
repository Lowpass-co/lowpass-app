/* ============================================================
   LOWPASS — <DaySheet> (D1-1)

   Presentational render of a DayObject. A block renders ONLY if its key is
   present on the object (i.e. it was in the viewer's slice) AND has data —
   out-of-slice blocks were never fetched, so there is nothing to hide. Every
   value is token-styled; no money or notes markup exists unless the object
   carries it.

   Server component (no interactivity here — the PDF composer button is a
   separate client island mounted by the page).
   ============================================================ */

import type { DayObject, ScheduleItem, DayHotel, DayFlight, DayContact } from '@/lib/day/loadDay';

function fmtDate(iso: string | null): string {
  if (!iso) return 'Date TBC';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

function mapsHref(address: string | null, name: string | null): string | null {
  const q = [name, address].filter(Boolean).join(', ').trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--lp-border)',
  borderRadius: 'var(--lp-radius-lg)',
  background: 'var(--lp-panel)',
  padding: 'var(--lp-space-4)',
};

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="lp-label-caps"
      style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--lp-text-tertiary)', letterSpacing: 'var(--lp-tracking-caps)' }}
    >
      {children}
    </h2>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)' }}>{children}</p>;
}

function VenueBlock({ venue }: { venue: DayObject['venue'] }) {
  if (venue === undefined) return null;
  const href = venue ? mapsHref(venue.address, venue.name) : null;
  return (
    <section style={cardStyle}>
      <SectionHeader>Venue</SectionHeader>
      {!venue || !venue.name ? (
        <Empty>No venue set for this day.</Empty>
      ) : (
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 'var(--lp-text-lg)', fontWeight: 'var(--lp-weight-bold)', color: 'var(--lp-text)' }}>{venue.name}</div>
          {venue.address ? <div style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>{venue.address}</div> : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>
            {venue.phone ? <span>{venue.phone}</span> : null}
            {venue.capacity != null ? <span>Cap. {venue.capacity.toLocaleString()}</span> : null}
            {venue.website ? <a href={venue.website} target="_blank" rel="noreferrer" style={{ color: 'var(--lp-text-link, var(--lp-text-secondary))' }}>Website</a> : null}
            {href ? <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--color-lp-orange)' }}>Map ↗</a> : null}
          </div>
        </div>
      )}
    </section>
  );
}

function ScheduleBlock({ schedule }: { schedule: DayObject['schedule'] }) {
  if (schedule === undefined) return null;
  return (
    <section style={cardStyle}>
      <SectionHeader>Schedule</SectionHeader>
      {!schedule || schedule.length === 0 ? (
        <Empty>No calls or times yet.</Empty>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
          {schedule.map((s: ScheduleItem, i) => (
            <li key={i} style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto', gap: 10, alignItems: 'baseline' }}>
              <span className="lp-mono" style={{ fontSize: 13, color: 'var(--lp-text)', whiteSpace: 'nowrap' }}>
                {s.approx && s.time ? '~' : ''}{s.time ?? '—'}
              </span>
              <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>
                {s.label}
                {s.detail ? <span style={{ color: 'var(--lp-text-tertiary)' }}> · {s.detail}</span> : null}
              </span>
              <span className="lp-label-caps" style={{ fontSize: 9, color: 'var(--lp-text-tertiary)' }}>
                {s.source === 'labor_call' ? 'Call' : 'Advance'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HotelBlock({ hotels }: { hotels: DayObject['hotels'] }) {
  if (hotels === undefined) return null;
  return (
    <section style={cardStyle}>
      <SectionHeader>Hotel</SectionHeader>
      {!hotels || hotels.length === 0 ? (
        <Empty>No hotel for this night.</Empty>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {hotels.map((h: DayHotel, i) => {
            const href = mapsHref(h.address, h.name);
            return (
              <div key={i} style={{ display: 'grid', gap: 3 }}>
                <div style={{ fontSize: 'var(--lp-text-base)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' }}>{h.name}</div>
                {h.address ? <div style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>{h.address}</div> : null}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>
                  {h.checkInAt ? <span>In {fmtTime(h.checkInAt)}</span> : null}
                  {h.checkOutAt ? <span>Out {fmtTime(h.checkOutAt)}</span> : null}
                  {h.confirmationNumber ? <span>Conf. {h.confirmationNumber}</span> : null}
                  {h.phone ? <span>{h.phone}</span> : null}
                  {href ? <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--color-lp-orange)' }}>Map ↗</a> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FlightsBlock({ flights }: { flights: DayObject['flights'] }) {
  if (flights === undefined) return null;
  return (
    <section style={cardStyle}>
      {/* "Flights" — there is no ground-transport model, so the block is scoped by name. */}
      <SectionHeader>Flights</SectionHeader>
      {!flights || flights.length === 0 ? (
        <Empty>No flights on this date.</Empty>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {flights.map((f: DayFlight, i) => (
            <li key={i} style={{ display: 'grid', gap: 2 }}>
              <div style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>
                <span className="lp-mono">{f.from} → {f.to}</span>
                <span style={{ color: 'var(--lp-text-tertiary)' }}> · {fmtTime(f.departAt)}–{fmtTime(f.arriveAt)}</span>
              </div>
              <div style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>
                {[f.who, [f.airline, f.flightNumber].filter(Boolean).join(' '), f.pnr ? `PNR ${f.pnr}` : null].filter(Boolean).join(' · ')}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ContactsBlock({ contacts }: { contacts: DayObject['contacts'] }) {
  if (contacts === undefined) return null;
  return (
    <section style={cardStyle}>
      <SectionHeader>Day-of contacts</SectionHeader>
      {!contacts || contacts.length === 0 ? (
        <Empty>No contacts listed.</Empty>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
          {contacts.map((c: DayContact, i) => (
            <li key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'baseline' }}>
              <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>
                {c.name} <span style={{ color: 'var(--lp-text-tertiary)' }}>· {c.role}</span>
              </span>
              <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>
                {c.phone ? <a href={`tel:${c.phone}`} style={{ color: 'inherit' }}>{c.phone}</a> : c.email ?? ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NotesBlock({ notes }: { notes: DayObject['notes'] }) {
  // Present only for slices that include `notes` (tm / production / accountant).
  if (notes === undefined) return null;
  return (
    <section style={cardStyle}>
      <SectionHeader>Notes</SectionHeader>
      {notes ? (
        <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>{notes}</p>
      ) : (
        <Empty>No notes.</Empty>
      )}
    </section>
  );
}

function PnlChip({ pnl }: { pnl: DayObject['pnl']; tourId: string }) {
  // Present only for money slices (tm / accountant / management). null = in slice
  // but no settlement yet → nothing to show.
  if (!pnl) return null;
  const fmt = (n: number | null) =>
    n == null ? '—' : `${pnl.currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 16,
        alignItems: 'baseline',
        border: '1px solid var(--lp-border)',
        borderRadius: 'var(--lp-radius-md)',
        padding: '6px 12px',
        background: 'var(--lp-surface)',
      }}
    >
      <span className="lp-label-caps" style={{ fontSize: 9, color: 'var(--lp-text-tertiary)' }}>Day P&amp;L</span>
      <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>Gtee <span className="lp-mono" style={{ color: 'var(--lp-text)' }}>{fmt(pnl.guarantee)}</span></span>
      <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>Net <span className="lp-mono" style={{ color: 'var(--lp-text)' }}>{fmt(pnl.showNet)}</span></span>
    </div>
  );
}

export function DaySheet({ day, actions }: { day: DayObject; actions?: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--lp-space-4)' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div className="lp-label-caps" style={{ fontSize: 10, color: 'var(--lp-text-tertiary)' }}>
            {[day.artistName, day.tourName].filter(Boolean).join(' · ')}
          </div>
          <h1 style={{ margin: '2px 0 0', fontSize: 'var(--lp-text-xl)', fontWeight: 'var(--lp-weight-bold)', color: 'var(--lp-text)' }}>
            {fmtDate(day.date)}
            {day.city ? <span style={{ color: 'var(--lp-text-secondary)', fontWeight: 'var(--lp-weight-regular)' }}> — {day.city}</span> : null}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <PnlChip pnl={day.pnl} tourId={day.tourId} />
          {actions}
        </div>
      </header>

      <div style={{ display: 'grid', gap: 'var(--lp-space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <VenueBlock venue={day.venue} />
        <ScheduleBlock schedule={day.schedule} />
        <HotelBlock hotels={day.hotels} />
        <FlightsBlock flights={day.flights} />
        <ContactsBlock contacts={day.contacts} />
        <NotesBlock notes={day.notes} />
      </div>
    </div>
  );
}
