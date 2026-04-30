/* ============================================
   LOWPASS — Account · Rental (Phase 1 §D placeholder)

   Per Adam's migration-map decision #3: per-user rental business
   lives at the account level — not the workspace level. Accessed
   via the avatar dropdown alongside Settings + Bug reports, not
   from the four-product rail.

   Phase 1 ships an empty placeholder. Future phases bring in the
   gear/equipment management UI from src/components/equipment/*
   (currently mounted at /equipment, which gets folded here per
   decision #13).
   ============================================ */

import { listAppPageShell } from '@/components/shell/app-page-shells';

export default function AccountRentalPage() {
  return listAppPageShell(
    <div className="mx-auto max-w-3xl space-y-4 py-6">
      <header>
        <p
          style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          Account · per-user feature
        </p>
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 600,
            lineHeight: 1.2,
            color: 'var(--lp-text)',
          }}
        >
          Rental
        </h1>
      </header>
      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: 'var(--lp-border-strong)',
          background: 'var(--lp-surface)',
        }}
      >
        <p
          style={{
            fontSize: '13px',
            color: 'var(--lp-text-secondary)',
            lineHeight: 1.5,
          }}
        >
          Per-user rental business management. Inventory, rate cards,
          customer history, and rental quotes will live here. Migrated
          out of the workspace-level <code>/equipment</code> route per
          Adam&apos;s decision #3 — rental is a personal feature, not
          a tour-management surface.
        </p>
        <p
          className="mt-3"
          style={{
            fontSize: '12px',
            color: 'var(--lp-text-tertiary)',
            lineHeight: 1.5,
          }}
        >
          Scaffolded in Phase 1. Real UI lands when the rental product
          is greenlit — until then this route exists for stable links
          from the avatar dropdown.
        </p>
      </div>
    </div>,
  );
}
