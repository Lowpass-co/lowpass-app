/* ============================================
   LOWPASS — <LaborCallReadView> (P6)

   Read-only render of a day's labor calls for the day sheet / /m/today / export.
   The same registered block as the editor (registry.tsx), read surface. Crew care
   about the call schedule more than anything else on the sheet, so it renders as
   its own block. NOT payroll.
   ============================================ */

'use client';

import { useEffect, useState } from 'react';
import type { LaborCall } from '@/lib/labor-calls/types';
import type { AdvanceBlockReadProps } from '@/components/advance/blocks/registry';

export function LaborCallReadView({ routingId }: AdvanceBlockReadProps) {
  const [calls, setCalls] = useState<LaborCall[] | null>(null);

  useEffect(() => {
    fetch(`/api/labor-calls?routing_id=${routingId}`)
      .then((r) => (r.ok ? r.json() : { calls: [] }))
      .then((j) => setCalls((j.calls ?? []) as LaborCall[]))
      .catch(() => setCalls([]));
  }, [routingId]);

  if (calls == null) return <div className="text-xs text-lp-text-tertiary">Loading…</div>;
  if (calls.length === 0) return <div className="text-xs text-lp-text-tertiary">No labor calls.</div>;

  return (
    <ul className="flex flex-col gap-1.5">
      {calls.map((c) => (
        <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          <span className="font-semibold text-lp-text">{c.department || '—'}</span>
          {c.call_time && (
            <span className="font-mono text-xs text-lp-text-secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {c.call_time}
            </span>
          )}
          {c.headcount != null && <span className="text-xs text-lp-text-secondary">×{c.headcount}</span>}
          {c.company && <span className="text-xs text-lp-text-tertiary">· {c.company}</span>}
          {(c.contact_name || c.contact_phone) && (
            <span className="text-xs text-lp-text-tertiary">
              · {c.contact_name}
              {c.contact_phone ? ` ${c.contact_phone}` : ''}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
