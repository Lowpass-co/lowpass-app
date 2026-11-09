'use client';

/* ============================================
   LOWPASS — <TourDetailsPanel> (Nov 2026, Adam)

   Tour settings › Details. Reads the tour's facts; Edit opens the canonical
   EditTourSlideOver (name / currency / region save as you type; a date
   change asks first and lists every show it would leave outside the tour);
   Delete opens the existing delete confirmation (counts what goes with it).
   Read-only members see the facts without the buttons.
   ============================================ */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EditTourSlideOver, type EditTourInitial } from '@/components/tour-settings/EditTourSlideOver';
import { TourDeleteConfirmationModal } from '@/components/shell-v2/TourDeleteConfirmationModal';
import { regionLabel } from '@/lib/tours/regions';

function formatDay(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export interface TourDetailsPanelProps {
  tourId: string;
  artist: { id: string; name: string } | null;
  initial: EditTourInitial;
  dayCount: number;
  routingDates: ReadonlyArray<{ id: string; date: string; city: string | null; venue_name: string | null }>;
  canWrite: boolean;
}

export function TourDetailsPanel({ tourId, artist, initial, dayCount, routingDates, canWrite }: TourDetailsPanelProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const facts: Array<[string, React.ReactNode]> = [
    ['Name', initial.name || '—'],
    ['Artist', artist ? <Link href={`/artists/${artist.id}`}>{artist.name}</Link> : '—'],
    ['Starts', formatDay(initial.start_date)],
    ['Ends', formatDay(initial.end_date)],
    [
      'Days',
      <span key="d">
        {dayCount} {dayCount === 1 ? 'day' : 'days'} ·{' '}
        <Link href={`/operations/${tourId}/routing`}>edit dates &amp; routing</Link>
      </span>,
    ],
    ['Currency', initial.currency ?? '—'],
    ['Region', regionLabel(initial.continent)],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-6)', maxWidth: 720 }}>
      <section
        aria-labelledby="tour-details-h"
        style={{
          border: '1px solid var(--lp-border)',
          borderRadius: 'var(--lp-radius-lg)',
          background: 'var(--lp-surface)',
          padding: 'var(--lp-space-4)',
        }}
      >
        <div className="flex items-center justify-between" style={{ gap: 'var(--lp-space-3)', marginBottom: 'var(--lp-space-3)' }}>
          <h2 id="tour-details-h" className="lp-h3" style={{ margin: 0 }}>
            Details
          </h2>
          {canWrite ? (
            <Button size="sm" variant="secondary" leadingIcon={<Pencil />} onClick={() => setEditOpen(true)} data-testid="tour-edit-details">
              Edit details
            </Button>
          ) : null}
        </div>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(90px, max-content) minmax(0, 1fr)',
            columnGap: 'var(--lp-space-4)',
            rowGap: 'var(--lp-space-2)',
            margin: 0,
            fontSize: 'var(--lp-text-sm)',
          }}
        >
          {facts.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt style={{ color: 'var(--lp-text-tertiary)' }}>{k}</dt>
              <dd style={{ margin: 0, color: 'var(--lp-text)', minWidth: 0, overflowWrap: 'anywhere' }}>{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {canWrite ? (
        <section
          aria-labelledby="tour-delete-h"
          style={{
            border: '1px solid color-mix(in srgb, var(--color-lp-error) 35%, transparent)',
            borderRadius: 'var(--lp-radius-lg)',
            padding: 'var(--lp-space-4)',
          }}
        >
          <div className="flex flex-wrap items-center justify-between" style={{ gap: 'var(--lp-space-3)' }}>
            <div style={{ minWidth: 0 }}>
              <h2 id="tour-delete-h" className="lp-h3" style={{ margin: 0 }}>
                Delete this tour
              </h2>
              <p style={{ margin: 'var(--lp-space-1) 0 0', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>
                You’ll see everything that goes with it before anything is deleted.
              </p>
            </div>
            <Button size="sm" variant="danger" leadingIcon={<Trash2 />} onClick={() => setDeleteOpen(true)} data-testid="tour-delete">
              Delete tour…
            </Button>
          </div>
        </section>
      ) : null}

      {editOpen ? (
        <EditTourSlideOver
          open
          tourId={tourId}
          initial={initial}
          routingDates={routingDates}
          onClose={() => setEditOpen(false)}
          onSaved={() => router.refresh()}
        />
      ) : null}
      {deleteOpen ? (
        <TourDeleteConfirmationModal
          open
          tourId={tourId}
          tourName={initial.name}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            setDeleteOpen(false);
            router.push(artist ? `/artists/${artist.id}` : '/artists');
          }}
        />
      ) : null}
    </div>
  );
}
