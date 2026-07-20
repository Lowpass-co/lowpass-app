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
}: Props) {
  // S1 — inventory management moved to /assets (unified gear). This surface is
  // now Jobs-only; `inventory` is a READ, passed to the Jobs item-picker.
  const [inventory] = useState<RentalInventoryItem[]>(initialInventory);
  const [jobs, setJobs] = useState<RentalJob[]>(initialJobs);
  const [artists, setArtists] = useState<EquipmentArtistOption[]>(initialArtists);
  const [tours, setTours] = useState<EquipmentTourOption[]>(initialTours);

  return (
    <div className={EQUIPMENT_PAGE_SHELL_CLASS}>
      {/* UX Audit 2026 — uniform page chrome via <PageHeader>.
          Replaces the bespoke header markup; density toggle
          lives in the actions slot (right-aligned), matching
          every other workspace page. */}
      <PageHeader
        title="Rental jobs"
        subtitle="Job bookings — inventory now lives in Assets"
        actions={<EquipmentDensityToggle />}
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
        />
      </div>
    </div>
  );
}
