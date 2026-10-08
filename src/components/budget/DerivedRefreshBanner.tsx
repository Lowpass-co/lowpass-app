/* ============================================
   LOWPASS — "automatic lines couldn't refresh" banner (money repair)

   The derived-line reconcile used to swallow every error, so a failed refresh
   looked exactly like a correct budget. When it fails now, the page says so:
   the hotel / payroll / flight / gear lines shown are the last good copy, not
   today's figures. Presentational — the page passes the reconcile result.
   ============================================ */

import { AlertTriangle } from 'lucide-react';

const FAMILY_LABEL: Record<string, string> = {
  hotel_booking: 'hotels',
  payroll: 'salaries',
  payroll_per_diem: 'per diems',
  flight: 'flights',
  gear: 'gear hire',
};

export function DerivedRefreshBanner({
  failed,
  detail,
}: {
  /** Families that did NOT refresh. */
  failed: string[];
  /** First error message, for the tooltip. */
  detail?: string;
}) {
  if (failed.length === 0) return null;
  const names = failed.map((f) => FAMILY_LABEL[f] ?? f).join(', ');
  return (
    <div
      role="alert"
      title={detail}
      className="mx-4 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2"
      style={{
        borderColor: 'var(--color-lp-warning)',
        background: 'color-mix(in srgb, var(--color-lp-warning) 10%, transparent)',
        fontSize: 'var(--lp-text-sm)',
      }}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: 'var(--color-lp-warning)' }} aria-hidden />
      <span style={{ color: 'var(--lp-text)' }}>
        Couldn’t refresh the automatic {names} lines — they show the last saved figures. Reload to try again.
      </span>
    </div>
  );
}
