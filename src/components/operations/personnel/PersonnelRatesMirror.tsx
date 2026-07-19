'use client';

/* ============================================
   LOWPASS — Operations · Personnel rates mirror (PAY-09)

   A READ-ONLY reflection of each tour member's rate / type / per-diem,
   using the same visual grammar as the Payroll rates summary. There is
   ONE write surface for rates (Payroll) — this page never edits them, so
   there are no inputs here. Every rate value is a link: clicking routes to
   Payroll with that person focused (?focus=<personnel_rate id>).

   Data is the rates SSOT (personnel_rate_lines via rateAmountsFor), loaded
   server-side by the page and passed down as `rows` — no client fetch, so
   the already-cold Personnel page doesn't grow another round-trip.
   ============================================ */

import { useRouter } from 'next/navigation';

export interface RateMirrorRow {
  /** personnel_rates.id — the Payroll ?focus key. */
  id: string;
  person_name: string;
  role: string | null;
  rate_type: string | null;
  /** Primary daily fee: day-rate card → off/day amount, else the Show rate. */
  rate: number;
  perDiem: number;
}

/* Mirrors RT_OPTIONS in PayrollRatesSpreadsheet so the Type column reads the
   same as the write surface. */
const RATE_TYPE_LABEL: Record<string, string> = {
  day_rate: 'Day rate',
  split_rate: 'Split rate',
  flat_tour: 'Flat tour',
  weekly: 'Weekly',
  per_diem_only: 'Per diem only',
};

function labelForType(rt: string | null): string {
  if (!rt) return '—';
  return RATE_TYPE_LABEL[rt] ?? rt.replace(/_/g, ' ');
}

const COLS = '1.6fr 1fr 0.9fr 0.9fr 0.9fr';

export function PersonnelRatesMirror({
  tourId,
  currency,
  rows,
}: {
  tourId: string;
  currency: string;
  rows: RateMirrorRow[];
}) {
  const router = useRouter();

  if (rows.length === 0) return null;

  const focus = (id: string) =>
    router.push(`/operations/${tourId}/payroll?focus=${id}`);

  const money = (n: number) =>
    n > 0 ? `${currency} ${Number(n).toLocaleString()}` : '—';

  return (
    <section
      aria-label="Rates (read-only)"
      style={{
        border: '1px solid var(--lp-border-subtle)',
        borderRadius: 'var(--lp-radius-md)',
        background: 'var(--lp-surface)',
        overflow: 'hidden',
      }}
    >
      <header
        className="flex items-baseline justify-between"
        style={{
          gap: 'var(--lp-space-2)',
          padding: 'var(--lp-space-3) var(--lp-space-4)',
          borderBottom: '1px solid var(--lp-border-subtle)',
        }}
      >
        <span
          className="lp-label-caps"
          style={{
            fontSize: 'var(--lp-text-2xs)',
            fontWeight: 'var(--lp-weight-semibold)',
            color: 'var(--lp-text-secondary)',
          }}
        >
          Rates
        </span>
        <span
          style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}
        >
          Read-only · edit in Payroll ↗
        </span>
      </header>

      {/* Column heads */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: COLS,
          gap: 'var(--lp-space-3)',
          padding: '6px var(--lp-space-4)',
          borderBottom: '1px solid var(--lp-border-subtle)',
          fontSize: 'var(--lp-text-2xs)',
          color: 'var(--lp-text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        <span>Name</span>
        <span>Role</span>
        <span>Type</span>
        <span style={{ textAlign: 'right' }}>Rate</span>
        <span style={{ textAlign: 'right' }}>Per diem</span>
      </div>

      <div role="rowgroup">
        {rows.map((r) => (
          <div
            key={r.id}
            role="row"
            style={{
              display: 'grid',
              gridTemplateColumns: COLS,
              gap: 'var(--lp-space-3)',
              alignItems: 'center',
              padding: '8px var(--lp-space-4)',
              borderBottom: '1px solid var(--lp-border-subtle)',
              fontSize: 'var(--lp-text-sm)',
            }}
          >
            <span
              style={{
                color: 'var(--lp-text)',
                fontWeight: 'var(--lp-weight-medium)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {r.person_name}
            </span>
            <span style={{ color: 'var(--lp-text-secondary)' }}>{r.role || '—'}</span>
            <span style={{ color: 'var(--lp-text-secondary)' }}>
              {labelForType(r.rate_type)}
            </span>
            <span style={{ textAlign: 'right' }}>
              <RateLink label={money(r.rate)} onClick={() => focus(r.id)} />
            </span>
            <span style={{ textAlign: 'right' }}>
              <RateLink label={money(r.perDiem)} onClick={() => focus(r.id)} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function RateLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title="Edit rates in Payroll"
      onClick={onClick}
      className="lp-mono"
      style={{
        border: 0,
        background: 'transparent',
        cursor: 'pointer',
        color: 'var(--lp-text)',
        font: 'inherit',
        fontVariantNumeric: 'tabular-nums',
        textDecoration: 'underline',
        textDecorationColor: 'var(--lp-border-strong)',
        textUnderlineOffset: 3,
      }}
    >
      {label}
    </button>
  );
}
