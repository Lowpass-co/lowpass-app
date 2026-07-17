/* ============================================
   LOWPASS — Advance · Right rail (Variant parity §B)

   300px right rail rendered in BOTH read and builder modes. Three
   stacked cards:
     1. VENUE SPECS — key/value rows from the routing record (capacity,
        address, phone, website). Mono numerics on the right.
     2. KEY CONTACTS — extracted from the advance's filled contact
        fields (existing extractKeyContacts util in @/lib/advance/key-info).
     3. PREVIOUSLY PLAYED — embeds <PreviouslyPlayedRailCard /> client
        island for the slide-over open/close + import flow.

   Replaces the inline KeyInfoBlock that used to render at the top of
   the read view, plus moves the floating "Previously played" button
   into a rail card. Per §B: "rail is visible in both read mode AND
   builder mode."

   Server component. Data is fully prepared in page.tsx.
   ============================================ */

import type { KeyContactCard } from '@/lib/advance/key-info';
import { Phone, Mail, Pencil } from 'lucide-react';
import { PreviouslyPlayedRailCard } from './PreviouslyPlayedRailCard';

export type SpecRow = {
  label: string;
  /** Pre-formatted value. Render as-is on the right side, mono. */
  value: string;
};

type SectionDef = {
  template_id: string;
  label: string;
  order?: number;
};

interface AdvanceShowRightRailProps {
  routingId: string;
  /** Specs already filtered to non-null rows by the page. */
  specs: SpecRow[];
  contacts: KeyContactCard[];
  currentSections: SectionDef[];
  /** A#5 — in-page anchor of the editable Venue Info section (read surface).
   *  null when the advance has no venue section; hides the edit link then. */
  venueEditAnchor?: string | null;
}

export function AdvanceShowRightRail({
  routingId,
  specs,
  contacts,
  currentSections,
  venueEditAnchor,
}: AdvanceShowRightRailProps) {
  return (
    <aside
      className="advance-read-no-print flex shrink-0 flex-col gap-3 p-4"
      style={{
        width: 300,
        borderLeft: '1px solid var(--lp-border-strong)',
        background: 'var(--lp-panel)',
      }}
    >
      {/* ── VENUE SPECS ──────────────────────────────────── */}
      <RailCard title="Venue specs">
        {specs.length === 0 ? (
          <p
            style={{
              fontSize: '13px',
              color: 'var(--lp-text-tertiary)',
              fontStyle: 'italic',
            }}
          >
            No venue specs recorded.
          </p>
        ) : (
          <dl className="flex flex-col gap-2">
            {/* revamp #23 — stacked label-above-value (not label-left/value-right)
                so a long address or website URL wraps cleanly; and no .lp-mono —
                these are free text, not numerics. */}
            {specs.map((row, i) => (
              <div
                key={`${row.label}-${i}`}
                className="py-1.5"
                style={{
                  borderBottom:
                    i === specs.length - 1
                      ? 'none'
                      : '1px solid var(--lp-border-subtle)',
                }}
              >
                <dt
                  style={{
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--lp-text-tertiary)',
                  }}
                >
                  {row.label}
                </dt>
                <dd
                  style={{
                    fontSize: '13px',
                    color: 'var(--lp-text)',
                    marginTop: '2px',
                    wordBreak: 'break-word',
                  }}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {venueEditAnchor ? (
          <a
            href={`#${venueEditAnchor}`}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--lp-orange)' }}
          >
            <Pencil size={12} aria-hidden /> Edit venue info
          </a>
        ) : null}
      </RailCard>

      {/* ── KEY CONTACTS ─────────────────────────────────── */}
      <RailCard title="Key contacts">
        {contacts.length === 0 ? (
          <p
            style={{
              fontSize: '13px',
              color: 'var(--lp-text-tertiary)',
              fontStyle: 'italic',
            }}
          >
            No key contacts yet.
          </p>
        ) : (
          <ul className="flex flex-col">
            {contacts.map((c, i) => (
              <li
                key={`${c.name}-${c.email ?? ''}-${i}`}
                className="py-2"
                style={{
                  borderBottom:
                    i === contacts.length - 1
                      ? 'none'
                      : '1px solid var(--lp-border-subtle)',
                }}
              >
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--lp-text)',
                  }}
                >
                  {c.name}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--lp-text-tertiary)',
                    marginTop: 1,
                  }}
                >
                  {c.role}
                </div>
                <div className="mt-1 flex flex-col gap-0.5">
                  {c.phone ? (
                    <a
                      href={`tel:${c.phone}`}
                      className="lp-mono inline-flex items-center gap-1.5"
                      style={{
                        fontSize: '11px',
                        color: 'var(--lp-text-secondary)',
                      }}
                    >
                      <Phone className="h-3 w-3 shrink-0" />
                      {c.phone}
                    </a>
                  ) : null}
                  {c.email ? (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex items-center gap-1.5"
                      style={{
                        fontSize: '11px',
                        color: 'var(--lp-text-secondary)',
                      }}
                    >
                      <Mail className="h-3 w-3 shrink-0" />
                      {c.email}
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </RailCard>

      {/* ── PREVIOUSLY PLAYED ────────────────────────────── */}
      <RailCard title="Previously played">
        <PreviouslyPlayedRailCard
          routingId={routingId}
          currentSections={currentSections}
        />
      </RailCard>
    </aside>
  );
}

function RailCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-md border p-3"
      style={{
        borderColor: 'var(--lp-border-strong)',
        background: 'var(--lp-bg-deep)',
      }}
    >
      <h3
        style={{
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--lp-text-tertiary)',
          marginBottom: 8,
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

