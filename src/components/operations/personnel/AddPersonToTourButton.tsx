'use client';

/* ============================================
   LOWPASS — <AddPersonToTourButton> (Personnel unification, Phase 2/A)

   Shared "+ Add crew" trigger that mounts the standalone
   <AddCrewSlideOver> on ANY surface (Payroll, Rooming, …), not just
   the Crew page. Adding assigns the person to the tour roster via
   POST /api/tours/[id]/personnel — the single source — which seeds their
   rate card; the caller's `onAdded` receives the seeded card so the grid
   updates optimistically (no router.refresh).

   The panel adds several people at once, new ones included, and (for
   admins) their app access. The adjacent "Workspace personnel ↗" link is
   the explicit path to the full People page.
   ============================================ */

import { useState } from 'react';
import Link from 'next/link';
import { UserPlus, ExternalLink } from 'lucide-react';
import { AddCrewSlideOver } from './AddCrewSlideOver';

export function AddPersonToTourButton({
  tourId,
  tourStartDate,
  tourEndDate,
  onAdded,
}: {
  tourId: string;
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
        Add crew
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

      <AddCrewSlideOver
        open={open}
        tourId={tourId}
        tourStartDate={tourStartDate}
        tourEndDate={tourEndDate}
        onClose={() => setOpen(false)}
        onAdded={(result) => onAdded?.(result)}
      />
    </div>
  );
}
