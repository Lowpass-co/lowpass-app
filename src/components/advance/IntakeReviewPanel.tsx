/* ============================================
   LOWPASS — <IntakeReviewPanel> (P7 · Q7)

   The TM's review gate for venue intake. Fetches the PENDING answers for an
   advance instance and hands them to the shared ChangeReviewQueue; Apply POSTs
   accept/reject to /api/advance/intake/pending, where mergeIntakeIntoAdvance
   (never-clobber) runs at accept-time. Nothing auto-writes.
   ============================================ */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChangeReviewQueue, type ReviewRow } from '@/components/advance/ChangeReviewQueue';

interface PendingItem {
  id: string;
  label: string;
  sectionLabel: string;
  type: string;
  value: unknown;
  oldValue: unknown;
  source: string;
  provenance: string | null;
}

/** Human-readable one-liner for a value (labor rows summarise to a count). */
function display(value: unknown, type: string): string {
  if (value == null) return '';
  if (type === 'labor_call' && Array.isArray(value)) {
    return value.map((r) => (r as { department?: string }).department || 'call').join(', ') || `${value.length} calls`;
  }
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function IntakeReviewPanel({ advanceInstanceId }: { advanceInstanceId: string }) {
  const [pending, setPending] = useState<PendingItem[] | null>(null);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/advance/intake/pending?advance_instance_id=${advanceInstanceId}`);
    const json = res.ok ? await res.json() : { pending: [] };
    setPending((json.pending ?? []) as PendingItem[]);
  }, [advanceInstanceId]);

  useEffect(() => {
    // Async load — setState fires after the awaited fetch, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const onApply = useCallback(
    async (accepted: ReviewRow[]) => {
      if (!pending) return;
      setApplying(true);
      const acceptSet = new Set(accepted.map((r) => r.id));
      const accept = [...acceptSet];
      const reject = pending.map((p) => p.id).filter((id) => !acceptSet.has(id));
      await fetch('/api/advance/intake/pending', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ advance_instance_id: advanceInstanceId, accept, reject }),
      });
      setApplying(false);
      await load();
    },
    [pending, advanceInstanceId, load],
  );

  if (pending == null || pending.length === 0) return null;

  const rows: ReviewRow[] = pending.map((p) => ({
    id: p.id,
    label: `${p.sectionLabel} · ${p.label}${p.provenance ? ` (${p.provenance})` : ''}`,
    oldValue: display(p.oldValue, p.type) || null,
    newValue: display(p.value, p.type),
  }));

  const sources = Array.from(new Set(pending.map((p) => p.source)));
  const sourceLabel = `${pending.length} pending answer${pending.length === 1 ? '' : 's'} · ${sources.join(' / ')}`;

  return (
    <div className="rounded-xl border border-lp-orange/40 bg-lp-orange/5 p-3">
      <div className="mb-2 text-sm font-semibold text-lp-text">Venue answers to review</div>
      <ChangeReviewQueue
        rows={rows}
        sourceLabel={sourceLabel}
        applyLabel={applying ? 'Applying…' : 'Apply accepted'}
        onApply={onApply}
      />
    </div>
  );
}
