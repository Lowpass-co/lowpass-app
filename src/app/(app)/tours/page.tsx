/* ============================================
   LOWPASS — Tours List Page

   Shows all tours in the workspace as Kanban
   cards with overview data.
   ============================================ */

import { Plus } from 'lucide-react';
import Link from 'next/link';

export default function ToursPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-lp-text">Tours</h1>
          <p className="mt-1 text-sm text-lp-text-secondary">
            Manage your tours, routing, and advance progress.
          </p>
        </div>
        <Link
          href="/tours/create"
          className="flex items-center gap-2 rounded-lg bg-lp-orange px-4 py-2.5 text-sm font-medium text-white hover:bg-lp-orange-hover transition-colors"
        >
          <Plus size={16} />
          New Tour
        </Link>
      </div>

      {/* Placeholder — will be replaced with tour cards */}
      <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-lp-border py-20">
        <div className="text-center">
          <p className="text-lp-text-secondary">No tours yet.</p>
          <p className="mt-1 text-sm text-lp-text-tertiary">
            Create your first tour to get started.
          </p>
        </div>
      </div>
    </div>
  );
}
