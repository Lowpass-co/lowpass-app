'use client';

/* ============================================
   LOWPASS — <GearDetailSlideOver> (gear-chip target, 2026-08-06)

   Fires out of the channel-list "Gear linked" chip: the piece of gear, its
   hire history across tours, its movement log, and the hire totals. Read-only.

   ROI is deliberately NOT faked: the gear row has a hire cost but no purchase
   / replacement cost, so return-on-investment is uncomputable today. The panel
   says so in one line rather than inventing a ratio.
   ============================================ */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface GearRow {
  id: string;
  name: string;
  category: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  ownership: 'owned' | 'hired_to_client' | 'sub_hired' | string;
  owner_label: string | null;
  hire_cost_amount: number | null;
  hire_cost_currency: string | null;
  hire_cost_period: string | null;
  image_url: string | null;
  notes: string | null;
}
interface Deployment {
  id: string;
  quantity: number | null;
  starts_on: string | null;
  ends_on: string | null;
  tour_ownership: string | null;
  tour_hire_cost_amount: number | null;
  tour_hire_cost_currency: string | null;
  tour_hire_cost_period: string | null;
  tours: { id: string; name: string | null; start_date: string | null; end_date: string | null; currency: string | null } | null;
}
interface Movement {
  id: string;
  movement_type: string | null;
  notes: string | null;
  created_at: string | null;
  rental_jobs?: { name: string | null } | null;
}
interface Totals {
  deploymentCount: number;
  hireByBucket: Array<{ currency: string; period: string; amount: number; count: number }>;
  firstOut: string | null;
  lastOut: string | null;
}
interface Payload {
  gear: GearRow;
  deployments: Deployment[];
  movements: Movement[];
  totals: Totals;
}

const OWNERSHIP: Record<string, { label: string; color: string }> = {
  owned: { label: 'Owned', color: 'var(--color-lp-status-complete, #3fb950)' },
  hired_to_client: { label: 'Hired to client', color: 'var(--color-lp-orange, #ff6b2c)' },
  sub_hired: { label: 'Sub-hired', color: '#60a5fa' },
};
const MOVEMENT_LABEL: Record<string, string> = {
  scan_out: 'Scanned out',
  scan_in: 'Scanned in',
  mark_repair: 'Marked for repair',
  mark_lost: 'Marked lost',
  manual_correction: 'Manual correction',
};

function fmtMoney(amount: number, currency: string, period: string): string {
  const n = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n} ${currency}${period ? ` / ${period}` : ''}`;
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function GearDetailSlideOver({ gearId, onClose }: { gearId: string | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  useEffect(() => {
    if (!gearId) return;
    let cancelled = false;
    /* set-state kept out of the effect's own render pass (repo convention —
       react-hooks/set-state-in-effect); the fetch resolves asynchronously. */
    queueMicrotask(() => {
      if (cancelled) return;
      setData(null);
      setError(null);
    });
    void (async () => {
      try {
        const res = await fetch(`/api/gear/${encodeURIComponent(gearId)}/detail`);
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) { setError(j.error ?? `Failed (${res.status})`); return; }
        setData(j as Payload);
      } catch {
        if (!cancelled) setError('Network error');
      }
    })();
    return () => { cancelled = true; };
  }, [gearId]);

  useEffect(() => {
    if (!gearId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gearId, onClose]);

  if (!gearId || !mounted) return null;

  const own = data ? (OWNERSHIP[data.gear.ownership] ?? { label: data.gear.ownership, color: 'var(--lp-text-tertiary)' }) : null;

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--lp-z-modal, 80)' as unknown as number }}>
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', animation: 'lp-fade-in var(--lp-dur-base, 150ms) ease' }}
      />
      <aside
        role="dialog"
        aria-label="Gear detail"
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(480px, 100vw)',
          background: 'var(--lp-surface)', borderLeft: '1px solid var(--lp-border-strong)',
          boxShadow: 'var(--lp-shadow-lg, -12px 0 32px rgba(0,0,0,0.4))',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'lp-slide-in-right var(--lp-dur-base, 150ms) var(--lp-ease-out, ease)',
        }}
      >
        <header className="flex items-start justify-between gap-3" style={{ padding: '16px 18px', borderBottom: '1px solid var(--lp-border)' }}>
          <div className="flex min-w-0 items-center gap-3">
            {data?.gear.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.gear.image_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
            ) : null}
            <div className="min-w-0">
              <h2 className="truncate" style={{ margin: 0, fontSize: 'var(--lp-text-lg, 17px)', fontWeight: 700, color: 'var(--lp-text)' }}>
                {data?.gear.name ?? 'Loading…'}
              </h2>
              {data ? (
                <p className="truncate" style={{ margin: '2px 0 0', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>
                  {[data.gear.manufacturer, data.gear.model].filter(Boolean).join(' · ') || data.gear.category || '—'}
                </p>
              ) : null}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="btn-transition shrink-0" style={{ border: 'none', background: 'transparent', color: 'var(--lp-text-tertiary)', cursor: 'pointer', padding: 4 }}>
            <X className="h-4 w-4" />
          </button>
        </header>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 18px' }}>
          {error ? (
            <p style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-error, #f85149)' }}>{error}</p>
          ) : !data ? (
            <p style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)' }}>Loading…</p>
          ) : (
            <>
              {/* Identity strip */}
              <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 16 }}>
                {own ? (
                  <span className="inline-flex items-center gap-1.5" style={{ fontSize: 'var(--lp-text-2xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: own.color }}>
                    <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: own.color }} />
                    {own.label}
                    {data.gear.owner_label ? <span style={{ color: 'var(--lp-text-tertiary)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· {data.gear.owner_label}</span> : null}
                  </span>
                ) : null}
                {data.gear.serial_number ? (
                  <span className="lp-mono" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>SN {data.gear.serial_number}</span>
                ) : null}
              </div>

              {/* Stat strip */}
              <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 18 }}>
                <Stat label="Deployments" value={<span className="lp-mono">{data.totals.deploymentCount}</span>} />
                <Stat label="First out" value={fmtDate(data.totals.firstOut)} />
                <Stat label="Last out" value={fmtDate(data.totals.lastOut)} />
                <Stat
                  label="Hire booked"
                  value={
                    data.totals.hireByBucket.length === 0 ? '—' : (
                      <span style={{ display: 'flex', flexDirection: 'column' }}>
                        {data.totals.hireByBucket.map((b, i) => (
                          <span key={i} className="lp-mono" style={{ fontSize: 'var(--lp-text-xs)' }}>
                            {fmtMoney(b.amount, b.currency, b.period)}
                            <span style={{ color: 'var(--lp-text-tertiary)' }}> × {b.count}</span>
                          </span>
                        ))}
                      </span>
                    )
                  }
                />
              </div>

              {/* Hire history */}
              <SectionLabel>Hire history</SectionLabel>
              {data.deployments.length === 0 ? (
                <Empty>Not deployed on any tour yet.</Empty>
              ) : (
                <ul style={{ listStyle: 'none', margin: '0 0 18px', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.deployments.map((d) => {
                    const amount = d.tour_hire_cost_amount ?? data.gear.hire_cost_amount;
                    const currency = d.tour_hire_cost_currency ?? data.gear.hire_cost_currency ?? 'GBP';
                    const period = d.tour_hire_cost_period ?? data.gear.hire_cost_period ?? '';
                    const overrideOwn = d.tour_ownership && d.tour_ownership !== data.gear.ownership ? (OWNERSHIP[d.tour_ownership]?.label ?? d.tour_ownership) : null;
                    return (
                      <li key={d.id} style={{ padding: '9px 11px', borderRadius: 8, border: '1px solid var(--lp-border)', background: 'var(--lp-bg, #111)' }}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate" style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 600, color: 'var(--lp-text)' }}>{d.tours?.name ?? 'Tour'}</span>
                          {amount != null ? <span className="lp-mono shrink-0" style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>{fmtMoney(amount, currency, period)}</span> : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2" style={{ marginTop: 2, fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
                          <span>{fmtDate(d.starts_on)} – {fmtDate(d.ends_on)}</span>
                          <span>· qty {d.quantity ?? 1}</span>
                          {overrideOwn ? <span style={{ color: 'var(--color-lp-orange)' }}>· {overrideOwn} on this tour</span> : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Movements */}
              <SectionLabel>Movements</SectionLabel>
              {data.movements.length === 0 ? (
                <Empty>No scans logged.</Empty>
              ) : (
                <ul style={{ listStyle: 'none', margin: '0 0 18px', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {data.movements.map((m) => (
                    <li key={m.id} className="flex items-baseline justify-between gap-2" style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>
                      <span>
                        {MOVEMENT_LABEL[m.movement_type ?? ''] ?? m.movement_type ?? 'Movement'}
                        {m.rental_jobs?.name ? <span style={{ color: 'var(--lp-text-tertiary)' }}> · {m.rental_jobs.name}</span> : null}
                        {m.notes ? <span style={{ color: 'var(--lp-text-tertiary)' }}> · {m.notes}</span> : null}
                      </span>
                      <span className="lp-mono shrink-0" style={{ color: 'var(--lp-text-tertiary)' }}>{fmtDate(m.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {data.gear.ownership === 'owned' ? (
                <p style={{ marginTop: 4, fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
                  ROI needs a purchase cost — not tracked yet.
                </p>
              ) : null}
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ padding: '9px 11px', borderRadius: 8, border: '1px solid var(--lp-border)', background: 'var(--lp-bg, #111)' }}>
      <div style={{ fontSize: 'var(--lp-text-2xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--lp-text-tertiary)' }}>{label}</div>
      <div style={{ marginTop: 3, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>{value}</div>
    </div>
  );
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 'var(--lp-text-2xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--lp-text-tertiary)', margin: '0 0 8px' }}>{children}</div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: '0 0 18px', padding: '10px 12px', borderRadius: 8, border: '1px dashed var(--lp-border)', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>{children}</p>;
}
