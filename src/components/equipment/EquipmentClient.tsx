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
import type { RentalInventoryItem, RentalJob } from './types';

interface Props {
  userId: string;
  initialInventory: RentalInventoryItem[];
  initialJobs: RentalJob[];
}

type Tab = 'inventory' | 'jobs';

export function EquipmentClient({ userId, initialInventory, initialJobs }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('inventory');
  const [inventory, setInventory] = useState<RentalInventoryItem[]>(initialInventory);
  const [jobs, setJobs] = useState<RentalJob[]>(initialJobs);

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

      {/* Tabs */}
      <div
        className="flex gap-1 rounded-lg p-1 w-fit"
        style={{ backgroundColor: 'var(--lp-bg-secondary)', border: '1px solid var(--lp-border)' }}
      >
        {([
          { id: 'inventory', label: 'Inventory', icon: Package },
          { id: 'jobs',      label: 'Jobs',      icon: ClipboardList },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all',
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
            <Icon size={14} />
            {label}
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
          jobs={jobs}
          setJobs={setJobs}
          inventory={inventory}
        />
      )}
    </div>
  );
}
