'use client';

/* ============================================================
   LOWPASS — <ViewAsBar> (D1-5)

   TM/admin View-as: a bottom-right control (bug-tool placement idiom) listing
   the seven roles. Selecting one sets ?viewAs=<role>, which the SERVER re-reads
   and re-renders the Day through that role's slice — the same loadDay filters,
   not a client flag. So "view as Crew" genuinely omits money + notes from the
   served HTML, exactly like the crew token view (this is the permissions
   debugger AND the demo). Only mounted for admin/manager.
   ============================================================ */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ALL_ROLES, ROLE_LABELS, type TourRole } from '@/lib/roles/slices';

export function ViewAsBar({ viewingAs }: { viewingAs: TourRole | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const setViewAs = (role: TourRole | null) => {
    const next = new URLSearchParams(params);
    if (role) next.set('viewAs', role);
    else next.delete('viewAs');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    setOpen(false);
  };

  return (
    <>
      {/* Active banner — makes it unmistakable the view is scoped. */}
      {viewingAs ? (
        <div
          role="status"
          style={{ position: 'fixed', bottom: 84, right: 24, zIndex: 100, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: 'var(--color-lp-orange)', color: 'var(--lp-text-inverse)', boxShadow: 'var(--lp-shadow-lg, 0 4px 12px rgba(0,0,0,0.2))', fontSize: 'var(--lp-text-xs)', fontWeight: 'var(--lp-weight-semibold)' }}
        >
          Viewing as {ROLE_LABELS[viewingAs]}
          <button type="button" onClick={() => setViewAs(null)} data-testid="viewas-exit" style={{ border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}>Exit</button>
        </div>
      ) : null}

      {/* Role menu */}
      {open ? (
        <div
          style={{ position: 'fixed', bottom: 84, right: 24, zIndex: 101, width: 200, padding: 8, borderRadius: 'var(--lp-radius-lg)', background: 'var(--lp-panel)', border: '1px solid var(--lp-border-strong)', boxShadow: 'var(--lp-shadow-lg, 0 8px 24px rgba(0,0,0,0.25))' }}
        >
          <div className="lp-label-caps" style={{ fontSize: 9, color: 'var(--lp-text-tertiary)', padding: '2px 8px 6px' }}>View this day as</div>
          {ALL_ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setViewAs(r)}
              data-testid={`viewas-${r}`}
              className="btn-transition"
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 'var(--lp-text-sm)', borderRadius: 'var(--lp-radius-md)', border: 0, background: viewingAs === r ? 'color-mix(in srgb, var(--color-lp-orange) 12%, transparent)' : 'transparent', color: 'var(--lp-text)', cursor: 'pointer' }}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
      ) : null}

      {/* FAB */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="viewas-fab"
        title="View this day as another role"
        style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100, height: 48, width: 48, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--lp-border-strong)', background: viewingAs ? 'var(--color-lp-orange)' : 'var(--lp-panel)', color: viewingAs ? 'var(--lp-text-inverse)' : 'var(--lp-text-secondary)', boxShadow: 'var(--lp-shadow-lg, 0 4px 12px rgba(0,0,0,0.2))', cursor: 'pointer', fontSize: 18 }}
        aria-label="View as role"
      >
        {/* eye glyph */}
        <span aria-hidden>◉</span>
      </button>
    </>
  );
}
