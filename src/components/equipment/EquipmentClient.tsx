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
      {/* UX Audit 2026 — uniform page chrome via <PageHeader>.
          Replaces the bespoke header markup; density toggle
          lives in the actions slot (right-aligned), matching
          every other workspace page. */}
      <PageHeader
        title="Equipment"
        subtitle="Rental inventory and job bookings"
        actions={<EquipmentDensityToggle />}
        className="w-full shrink-0"
      />

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
              activeTab === id ? '' : 'hover:opacity-80'
            )}
            /* §D hue-budget — active segment is a light-tint + orange text
               (selected accent), not a filled orange slab. Token, not #FF4500. */
            style={
              activeTab === id
                ? {
                    color: 'var(--color-lp-orange)',
                    backgroundColor: 'color-mix(in srgb, var(--color-lp-orange) 10%, var(--lp-panel))',
                    boxShadow: 'var(--lp-shadow-sm)',
                  }
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
