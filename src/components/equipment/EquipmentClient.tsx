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
import type {
  EquipmentArtistOption,
  EquipmentTourOption,
  RentalInventoryItem,
  RentalJob,
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

export function EquipmentClient({
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
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
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
      </div>

      {/* Tabs — equal-width segments so the control does not resize */}
      <div
        className="flex w-full max-w-[340px] gap-1 rounded-lg p-1"
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

      {/* Tab content */}
      {activeTab === 'inventory' && (
        <InventoryTab
          userId={userId}
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
  );
}
