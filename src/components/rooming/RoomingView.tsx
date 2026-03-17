'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { RoomingMasterGrid } from './RoomingMasterGrid';
import { RoomingHotelSheet } from './RoomingHotelSheet';

interface RoomingViewProps {
  tourId: string;
  tourName: string;
  currency: string;
  routingDates: { id: string; date: string; venue_name?: string; city?: string; day_type?: string }[];
  hotels: { id: string; hotel_name: string; city?: string | null; address?: string | null; phone?: string | null; cancellation_policy?: string | null; distance_to_venue?: string | null; distance_to_airport?: string | null; room_assignments?: unknown[] }[];
  personnelRates: Record<string, unknown>[];
}

export function RoomingView({
  tourId,
  tourName,
  currency,
  routingDates,
  hotels,
  personnelRates,
}: RoomingViewProps) {
  const tabs = [
    { id: 'master', label: 'Master Grid' },
    ...hotels.map((h) => ({ id: h.id, label: `${h.hotel_name}${h.city ? ` · ${h.city}` : ''}` })),
  ];

  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? 'master');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-lp-text">{tourName} — Rooming</h1>

      <nav className="flex flex-wrap gap-0 border-b border-lp-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'text-xs font-semibold uppercase tracking-wider px-3 py-2 transition-colors',
              activeTab === t.id
                ? 'border-b-2 border-lp-orange text-lp-orange'
                : 'text-lp-text-secondary hover:text-lp-text'
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="min-h-[300px]">
        {activeTab === 'master' && (
          <RoomingMasterGrid
            tourId={tourId}
            currency={currency}
            routingDates={routingDates}
            personnelRates={personnelRates}
          />
        )}
        {activeTab !== 'master' && hotels.some((h) => h.id === activeTab) && (
          <RoomingHotelSheet
            hotelBooking={hotels.find((h) => h.id === activeTab)!}
            roomAssignments={(hotels.find((h) => h.id === activeTab)?.room_assignments ?? []) as { id: string; person_name: string | null; check_in: string | null; check_out: string | null; nights: number; room_type: string | null; room_number: string | null; confirmation: string | null; rate_per_night: number; notes: string | null }[]}
            currency={currency}
          />
        )}
      </div>
    </div>
  );
}
