/* ============================================
   LOWPASS — Rental jobs page shell (Nov 2026 visual pass)
   Holds the page's state — jobs, every job's lines (the list shows totals),
   workspace lists, rental settings — and renders the list / job page.
   ============================================ */

'use client';

import { useCallback, useState } from 'react';
import { JobsTab } from './JobsTab';
import { RentalSettingsPanel } from './RentalSettingsPanel';
import type { LinesUpdate, RentalSettingsView } from './JobDetail';
import type {
  EquipmentArtistOption,
  EquipmentTourOption,
  RentalInventoryItem,
  RentalJob,
  RentalJobItem,
} from './types';

interface Props {
  userId: string;
  workspaceId: string | null;
  initialInventory: RentalInventoryItem[];
  initialJobs: RentalJob[];
  initialLines: RentalJobItem[];
  initialArtists: EquipmentArtistOption[];
  initialTours: EquipmentTourOption[];
  settings: RentalSettingsView;
}

export function EquipmentClient({
  userId,
  workspaceId,
  initialInventory,
  initialJobs,
  initialLines,
  initialArtists,
  initialTours,
  settings: initialSettings,
}: Props) {
  // Stock is managed on Gear & rentals (/assets); here it's read for pricing + the picker.
  const [inventory] = useState<RentalInventoryItem[]>(initialInventory);
  const [jobs, setJobs] = useState<RentalJob[]>(initialJobs);
  const [artists, setArtists] = useState<EquipmentArtistOption[]>(initialArtists);
  const [tours, setTours] = useState<EquipmentTourOption[]>(initialTours);
  const [settings, setSettings] = useState<RentalSettingsView>(initialSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [linesByJob, setLinesByJob] = useState<Record<string, RentalJobItem[]>>(() => {
    const m: Record<string, RentalJobItem[]> = {};
    for (const l of initialLines) (m[l.job_id] ??= []).push(l);
    return m;
  });
  /* Functional updates, so two saves landing out of order can't put back a
     line list from before the other one. */
  const onLinesChange = useCallback((jobId: string, next: LinesUpdate) => {
    setLinesByJob((prev) => ({ ...prev, [jobId]: typeof next === 'function' ? next(prev[jobId] ?? []) : next }));
  }, []);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6">
      <JobsTab
        userId={userId}
        workspaceId={workspaceId}
        jobs={jobs}
        setJobs={setJobs}
        linesByJob={linesByJob}
        onLinesChange={onLinesChange}
        inventory={inventory}
        artists={artists}
        tours={tours}
        setArtists={setArtists}
        setTours={setTours}
        settings={settings}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <RentalSettingsPanel
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSaved={setSettings}
      />
    </div>
  );
}
