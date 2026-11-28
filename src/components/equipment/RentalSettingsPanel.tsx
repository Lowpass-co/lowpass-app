'use client';

/* ============================================
   LOWPASS — Rental settings (Nov 2026)
   The workspace's week, how long a quote holds, and the payment details the
   PDF can carry. One Save — these change documents clients receive, so no
   autosave while typing bank details.
   ============================================ */

import { useState } from 'react';
import { SlideOver } from '@/components/ui/SlideOver';
import { Button } from '@/components/ui/Button';
import { NumberField } from '@/components/ui/NumberField';
import { useToast } from '@/components/ui/Toast';
import { jobDaysPerWeek, WEEK_CHOICES } from '@/lib/rental-pricing';
import { cleanValidDays } from '@/lib/rental/quote';
import type { RentalSettingsView } from './JobDetail';

const FIELD =
  'w-full rounded-lg border bg-lp-surface px-3 text-sm text-lp-text outline-none ' +
  'focus-visible:border-[var(--color-lp-orange)] placeholder:text-lp-text-tertiary';

export function RentalSettingsPanel({
  open,
  settings,
  onClose,
  onSaved,
}: {
  open: boolean;
  settings: RentalSettingsView;
  onClose: () => void;
  onSaved: (s: RentalSettingsView) => void;
}) {
  return (
    <SlideOver open={open} onClose={onClose} title="Rental settings">
      {open ? <Body key="open" settings={settings} onClose={onClose} onSaved={onSaved} /> : null}
    </SlideOver>
  );
}

function Body({ settings, onClose, onSaved }: { settings: RentalSettingsView; onClose: () => void; onSaved: (s: RentalSettingsView) => void }) {
  const { showToast } = useToast();
  const [week, setWeek] = useState(jobDaysPerWeek({}, settings.daysPerWeek));
  const [valid, setValid] = useState(settings.quoteValidDays);
  const [payment, setPayment] = useState(settings.paymentDetails ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await fetch('/api/rental/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days_per_week: week, quote_valid_days: cleanValidDays(valid), payment_details: payment }),
    });
    const j = (await res.json().catch(() => ({}))) as { days_per_week?: number; quote_valid_days?: number; payment_details?: string | null; error?: string };
    setBusy(false);
    if (!res.ok) {
      showToast('Couldn’t save: ' + (j.error ?? res.status), 'error');
      return;
    }
    onSaved({
      daysPerWeek: j.days_per_week ?? week,
      quoteValidDays: j.quote_valid_days ?? cleanValidDays(valid),
      paymentDetails: (j.payment_details ?? '').trim() || null,
    });
    showToast('Rental settings saved', 'success');
    onClose();
  }

  return (
    <div className="flex flex-col gap-6" data-submit-scope>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-lp-text">A week is charged as</span>
        <select
          aria-label="A week is charged as"
          value={String(week)}
          onChange={(e) => setWeek(Number(e.target.value))}
          className={`lp-select h-9 ${FIELD}`}
          style={{ borderColor: 'var(--lp-border)' }}
        >
          {WEEK_CHOICES.map((n) => (
            <option key={n} value={String(n)}>{n === 7 ? '7 days (no week rate)' : `${n} days`}</option>
          ))}
        </select>
        <span className="text-xs text-lp-text-tertiary">New jobs use this. A job can set its own.</span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-lp-text">Quotes are valid for</span>
        <span className="flex items-center gap-2">
          <NumberField
            aria-label="Quote valid days"
            value={valid}
            blank={null}
            min={1}
            max={365}
            onValue={(n) => setValid(Math.round(n))}
            className={`h-9 w-24 text-right ${FIELD}`}
            style={{ borderColor: 'var(--lp-border)', appearance: 'textfield' }}
          />
          <span className="text-sm text-lp-text-secondary">days</span>
        </span>
        <span className="text-xs text-lp-text-tertiary">Printed on the quote as “Valid until”.</span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-lp-text">Payment details</span>
        <textarea
          value={payment}
          onChange={(e) => setPayment(e.target.value.slice(0, 2000))}
          rows={6}
          placeholder={'Lowpass Ltd\nSort code 00-00-00 · Account 00000000\nPayment due within 30 days'}
          className={`py-2 ${FIELD}`}
          style={{ borderColor: 'var(--lp-border)', resize: 'vertical' }}
        />
        <span className="text-xs text-lp-text-tertiary">Printed as you type it, when you tick Payment details on an export.</span>
      </label>

      <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: 'var(--lp-border)' }}>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="sm" loading={busy} onClick={() => void save()} data-submit>Save</Button>
      </div>
    </div>
  );
}
