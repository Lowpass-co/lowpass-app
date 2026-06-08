'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { RoomingMasterGrid } from './RoomingMasterGrid';
import { RoomingHotelSheet } from './RoomingHotelSheet';
import { AddPersonToTourButton } from '@/components/operations/personnel/AddPersonToTourButton';

/** One row per roster member — the authoritative people list (FOUNDATION
 *  FIX). person_name matches persons.full_name so the grid's cells/saves
 *  resolve; person_id drives roster membership (and the off-roster split). */
export interface RosterPerson {
  person_id: string | null;
  person_name: string;
  role: string;
}

interface RoomingViewProps {
  tourId: string;
  tourName: string;
  currency: string;
  routingDates: { id: string; date: string; venue_name?: string; city?: string; day_type?: string }[];
  hotels: { id: string; hotel_name: string; city?: string | null; address?: string | null; phone?: string | null; cancellation_policy?: string | null; distance_to_venue?: string | null; distance_to_airport?: string | null; room_assignments?: unknown[] }[];
  roster: RosterPerson[];
}

export function RoomingView({
  tourId,
  tourName,
  currency,
  routingDates,
  hotels,
  roster,
}: RoomingViewProps) {
  // FOUNDATION FIX — rows come from the roster. Held in state so adding a
  // person appends them optimistically (single source: roster → rooming
  // grid), no router.refresh.
  const [people, setPeople] = useState<RosterPerson[]>(roster);
  const excludePersonIds = useMemo(
    () =>
      people
        .map((r) => r.person_id)
        .filter((id): id is string => typeof id === 'string'),
    [people],
  );

  const tabs = [
    { id: 'master', label: 'Master Grid' },
    ...hotels.map((h) => ({ id: h.id, label: `${h.hotel_name}${h.city ? ` · ${h.city}` : ''}` })),
  ];

  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? 'master');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-lp-text">{tourName} — Rooming</h1>
        <AddPersonToTourButton
          tourId={tourId}
          excludePersonIds={excludePersonIds}
          onAdded={(result) => {
            const card = result?.rateCard as
              | { person_id?: string | null; person_name?: string | null; role?: string | null }
              | null
              | undefined;
            if (card) {
              setPeople((prev) => [
                ...prev,
                {
                  person_id: card.person_id ?? null,
                  person_name: (card.person_name ?? '').trim() || 'Unknown',
                  role: card.role ?? '',
                },
              ]);
            }
          }}
        />
      </div>

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
            roster={people}
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
