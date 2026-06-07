'use client';

/* ============================================
   LOWPASS — <AddPersonToTourButton> (Personnel unification, Phase 2/A)

   Shared "+ Add person" trigger that mounts the standalone
   <AddPersonnelSlideOver> on ANY surface (Payroll, Rooming, …), not just
   the Personnel page. Adding assigns the person to the tour roster via
   POST /api/tours/[id]/personnel — the single source — which seeds their
   rate card; the caller's `onAdded` receives the seeded card so the grid
   updates optimistically (no router.refresh).

   The slide already supports creating a brand-new workspace person inline
   (POST /api/personnel) before assigning. The adjacent "Workspace
   personnel ↗" link is the explicit path to the full workspace page.
   ============================================ */

import { useState } from 'react';
import Link from 'next/link';
import { UserPlus, ExternalLink } from 'lucide-react';
import { AddPersonnelSlideOver } from './AddPersonnelSlideOver';

export function AddPersonToTourButton({
  tourId,
  excludePersonIds = [],
  tourStartDate,
  tourEndDate,
  onAdded,
}: {
  tourId: string;
  excludePersonIds?: string[];
  tourStartDate?: string | null;
  tourEndDate?: string | null;
  onAdded?: (result?: {
    id?: string;
    rateCard?: Record<string, unknown> | null;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-transition inline-flex items-center gap-1.5 rounded-md px-3 py-1.5"
        style={{
          background: 'var(--color-lp-orange)',
          color: 'var(--lp-text-inverse, #fff)',
          fontSize: 'var(--lp-text-sm)',
          fontWeight: 'var(--lp-weight-semibold)',
        }}
        title="Add a person to this tour's roster"
      >
        <UserPlus className="h-4 w-4" aria-hidden />
        Add person
      </button>
      <Link
        href="/personnel"
        className="btn-transition inline-flex items-center gap-1"
        style={{
          fontSize: 'var(--lp-text-xs)',
          color: 'var(--lp-text-tertiary)',
        }}
        title="Create / manage people in the workspace"
      >
        Workspace personnel
        <ExternalLink className="h-3 w-3" aria-hidden />
      </Link>

      <AddPersonnelSlideOver
        open={open}
        tourId={tourId}
        excludePersonIds={excludePersonIds}
        tourStartDate={tourStartDate}
        tourEndDate={tourEndDate}
        onClose={() => setOpen(false)}
        onAdded={(result) => onAdded?.(result)}
      />
    </div>
  );
}
