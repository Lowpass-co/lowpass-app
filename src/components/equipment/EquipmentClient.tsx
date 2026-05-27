/* ============================================
   LOWPASS — Equipment Client Shell
   Manages tab state, shared inventory/jobs
   state, and renders the active tab.
   ============================================ */

'use client';

import { useState } from 'react';
import { Package, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InventoryTab } from './InventoryTab';
import { JobsTab } from './JobsTab';
import {
  EquipmentDensityProvider,
  EquipmentDensityToggle,
} from './EquipmentDensityContext';
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

type Tab = 'inventory' | 'jobs';

export function EquipmentClient(props: Props) {
  /* §B5 — wrap in EquipmentDensityProvider so the density
     toggle + the InventoryTab + JobsTab table cells share
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
  const [activeTab, setActiveTab] = useState<Tab>('inventory');
  const [inventory, setInventory] = useState<RentalInventoryItem[]>(initialInventory);
  const [jobs, setJobs] = useState<RentalJob[]>(initialJobs);
  const [artists, setArtists] = useState<EquipmentArtistOption[]>(initialArtists);
  const [tours, setTours] = useState<EquipmentTourOption[]>(initialTours);

  return (
    <div className={EQUIPMENT_PAGE_SHELL_CLASS}>
      {/* Page header — fixed slot at top of column */}
      <header className="flex w-full shrink-0 items-start justify-between gap-3">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight font-display"
            style={{ color: 'var(--lp-text)' }}
          >
            Equipment
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
            Rental inventory and job bookings
          </p>
        </div>
        {/* §B5 — density toggle pinned top-right, matches
            Budget's BudgetTabNav placement. */}
        <EquipmentDensityToggle />
      </header>

      {/* Tabs — full width of content column; equal-width segments */}
      <div
        className="flex w-full min-w-0 gap-1 rounded-lg p-1"
        style={{ backgroundColor: 'var(--lp-bg-secondary)', border: '1px solid var(--lp-border)' }}
      >
        {([
          { id: 'inventory' as const, label: 'Inventory', icon: Package },
          { id: 'jobs' as const, label: 'Jobs', icon: ClipboardList },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex flex-1 min-w-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-all',
              activeTab === id
                ? 'text-white shadow-sm'
                : 'hover:opacity-80'
            )}
            style={
              activeTab === id
                ? { backgroundColor: '#FF4500', color: 'white' }
                : { color: 'var(--lp-text-secondary)', backgroundColor: 'transparent' }
            }
          >
            <Icon size={14} className="shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab panels — same width as header/tabs */}
      <div className="w-full min-w-0">
      {activeTab === 'inventory' && (
        <InventoryTab
          userId={userId}
          workspaceId={workspaceId}
          inventory={inventory}
          setInventory={setInventory}
        />
      )}
      {activeTab === 'jobs' && (
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
      )}
      </div>
    </div>
  );
}
