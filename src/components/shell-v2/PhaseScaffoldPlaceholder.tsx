/* ============================================
   LOWPASS — Phase 1 §C placeholder for product surfaces

   Renders inside <ProductShell> for routes that have been scaffolded
   under the new product-prefixed URLs but whose content hasn't been
   migrated yet (Phases 2-4 do the migration). Linkable from rails,
   keeps URLs stable, and tells the user where to go for the live
   surface in the meantime.

   Usage:
     <PhaseScaffoldPlaceholder
       title="Operations · Channel List"
       phase="Phase 4"
       legacyHref={`/tours/${tourId}/channel-list`}
       legacyLabel="Open the live Channel List"
     />
   ============================================ */

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

interface PhaseScaffoldPlaceholderProps {
  title: string;
  phase: 'Phase 2' | 'Phase 3' | 'Phase 4';
  body?: string;
  /** Where the live surface still lives until migration. Optional —
      omit for new surfaces that have no legacy counterpart. */
  legacyHref?: string;
  legacyLabel?: string;
}

export function PhaseScaffoldPlaceholder({
  title,
  phase,
  body,
  legacyHref,
  legacyLabel,
}: PhaseScaffoldPlaceholderProps) {
  return (
    <div className="mx-auto w-full max-w-[960px] space-y-4 px-6 py-6">
      <header className="space-y-1">
        <p
          style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          Scaffolded · ships in {phase}
        </p>
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 600,
            lineHeight: 1.2,
            color: 'var(--lp-text)',
          }}
        >
          {title}
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
          {body ??
            `This page is the new product-prefixed home for ${title}. Navigation, rail state, and inbound redirects are wired in Phase 1. The actual surface content lands in ${phase}, where the legacy implementation gets ported onto the new shell.`}
        </p>

        {legacyHref && (
          <div className="mt-4">
            <Link
              href={legacyHref}
              className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5"
              style={{
                borderColor: 'var(--color-lp-orange)',
                color: 'var(--color-lp-orange)',
                background:
                  'color-mix(in srgb, var(--color-lp-orange) 4%, transparent)',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              {legacyLabel ?? 'Open the live page'}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
