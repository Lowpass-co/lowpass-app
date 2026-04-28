'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { SlideOver } from '@/components/shell/SlideOver';
import { getEntityDescriptor } from '@/lib/entities/registry';
import type { ShowEntity } from '@/lib/entities/show';

/**
 * Minimal Show entity slide-over. Renders core show metadata (date, city, venue,
 * day type, tour). Full advance/budget context lives in dedicated tour pages
 * (UX17 Advance, UX14 Budget); this is the canonical-entity quick-view.
 */
export default function ShowSlideOver({ id, onClose }: { id: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<ShowEntity | null>(null);

  useEffect(() => {
    const desc = getEntityDescriptor<ShowEntity>('show');
    if (!desc) {
      setError('Show entity descriptor not registered');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    desc
      .fetchById(id)
      .then((row) => {
        if (!row) throw new Error('Show not found');
        setShow(row);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  const title = show?.venue_name || show?.city || show?.date || 'Show';
  const subtitle = show ? `${show.date} · ${show.day_type}` : undefined;

  return (
    <SlideOver open onClose={onClose} title={title} subtitle={subtitle} width="default" backdrop>
      <div className="space-y-4 px-4 py-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading show…
          </div>
        )}
        {error && (
          <div
            className="rounded px-3 py-2 text-sm"
            style={{
              border: '1px solid var(--lp-border)',
              background: 'color-mix(in srgb, var(--color-lp-error) 12%, transparent)',
              color: 'var(--color-lp-error)',
            }}
          >
            {error}
          </div>
        )}
        {!loading && !error && show && (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--lp-text-tertiary)' }}>
                Date
              </dt>
              <dd style={{ color: 'var(--lp-text)' }}>{show.date}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--lp-text-tertiary)' }}>
                City
              </dt>
              <dd style={{ color: 'var(--lp-text)' }}>{show.city || '—'}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--lp-text-tertiary)' }}>
                Venue
              </dt>
              <dd style={{ color: 'var(--lp-text)' }}>{show.venue_name || '—'}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--lp-text-tertiary)' }}>
                Day type
              </dt>
              <dd style={{ color: 'var(--lp-text)' }}>{show.day_type || '—'}</dd>
            </div>
          </dl>
        )}
      </div>
    </SlideOver>
  );
}
