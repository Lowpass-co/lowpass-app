/* ============================================
   LOWPASS — Equipment Client Shell
   Manages tab state, shared inventory/jobs
   state, and renders the active tab.
   ============================================ */

'use client';

import { useState } from 'react';
import { JobsTab } from './JobsTab';
import {
  EquipmentDensityProvider,
  EquipmentDensityToggle,
} from './EquipmentDensityContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { jobDaysPerWeek, WEEK_CHOICES } from '@/lib/rental-pricing';
import {
  EQUIPMENT_PAGE_SHELL_CLASS,
  type EquipmentArtistOption,
  type EquipmentTourOption,
  type RentalInventoryItem,
  type RentalJob,
} from './types';

interface Props {
  userId: string;
  workspaceId: string | null;
  initialInventory: RentalInventoryItem[];
  initialJobs: RentalJob[];
  initialArtists: EquipmentArtistOption[];
  initialTours: EquipmentTourOption[];
  /** The workspace's week (306); null before it's pasted → 3. */
  daysPerWeekDefault?: number | null;
}

export function EquipmentClient(props: Props) {
  /* §B5 — wrap in EquipmentDensityProvider so the density
     toggle + the JobsTab table cells share
     one preference. The provider's data-lp-density attr
     on its wrapping div cascades to descendant <td>s via
     globals.css. */
  return (
    <EquipmentDensityProvider>
      <EquipmentClientBody {...props} />
    </EquipmentDensityProvider>
  );
}

function EquipmentClientBody({
  userId,
  workspaceId,
  initialInventory,
  initialJobs,
  initialArtists,
  initialTours,
  daysPerWeekDefault = null,
}: Props) {
  // S1 — inventory management moved to /assets (unified gear). This surface is
  // now Jobs-only; `inventory` is a READ, passed to the Jobs item-picker.
  const [inventory] = useState<RentalInventoryItem[]>(initialInventory);
  const [jobs, setJobs] = useState<RentalJob[]>(initialJobs);
  const [artists, setArtists] = useState<EquipmentArtistOption[]>(initialArtists);
  const [tours, setTours] = useState<EquipmentTourOption[]>(initialTours);
  const [week, setWeek] = useState<number | null>(daysPerWeekDefault);

  return (
    <div className={EQUIPMENT_PAGE_SHELL_CLASS}>
      {/* UX Audit 2026 — uniform page chrome via <PageHeader>.
          Replaces the bespoke header markup; density toggle
          lives in the actions slot (right-aligned), matching
          every other workspace page. */}
      <PageHeader
        title="Rental jobs"
        actions={
          <div className="flex items-center gap-3">
            <WeekDefault value={week} onSaved={setWeek} />
            <EquipmentDensityToggle />
          </div>
        }
        className="w-full shrink-0"
      />

      <div className="w-full min-w-0">
        <JobsTab
          userId={userId}
          workspaceId={workspaceId}
          jobs={jobs}
          setJobs={setJobs}
          inventory={inventory}
          artists={artists}
          tours={tours}
          setArtists={setArtists}
          setTours={setTours}
          daysPerWeekDefault={week}
        />
      </div>
    </div>
  );
}

/** The workspace's week for rental pricing (Adam: "3 day week, but
 *  customisable"). A job can still set its own. */
function WeekDefault({ value, onSaved }: { value: number | null; onSaved: (n: number) => void }) {
  const { showToast } = useToast();
  const current = jobDaysPerWeek({}, value);
  return (
    <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
      A week is charged as
      <select
        aria-label="Default week"
        className="lp-select rounded-lg border px-2 py-1 text-xs"
        style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-bg)', color: 'var(--lp-text)' }}
        value={String(current)}
        onChange={async (e) => {
          const n = Number(e.target.value);
          const res = await fetch('/api/rental/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ days_per_week: n }),
          });
          const j = (await res.json().catch(() => ({}))) as { days_per_week?: number; error?: string };
          if (!res.ok) {
            showToast('Couldn’t save the week: ' + (j.error ?? res.status), 'error');
            return;
          }
          onSaved(j.days_per_week ?? n);
        }}
      >
        {WEEK_CHOICES.map((n) => (
          <option key={n} value={String(n)}>
            {n} days
          </option>
        ))}
      </select>
    </label>
  );
}
