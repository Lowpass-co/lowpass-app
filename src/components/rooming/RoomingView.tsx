'use client';

/* ============================================
   LOWPASS — <RoomingView> (Stage B host)

   One dataset, three views over the shared <RoutingRail> night model:
     Matrix  — nights (rail) × people, room-code cells (default)
     Nights  — one row per hotel stay; click a row → its detail sheet
     Cards   — rail(nights) + the night's room cards + unassigned pool
   The rail is the constant; the view switcher swaps the body. Nights are
   filtered to "nights away" (Q2). Roster/add-person + the data layer + the
   derived budget feed are unchanged.
   ============================================ */

import { useMemo, useState } from 'react';
import { RoomingMatrix } from './RoomingMatrix';
import { RoomingCards } from './RoomingCards';
import { RoomingNightsOverview } from './RoomingNightsOverview';
import { RoomingHotelSheet } from './RoomingHotelSheet';
import { isNightAway } from './useRoomingGrid';
import { AddPersonToTourButton } from '@/components/operations/personnel/AddPersonToTourButton';
import { RoomingExportButton } from '@/components/rooming/RoomingExportButton';
import { PageTitle } from '@/components/ui/PageHeader';

export interface RosterPerson {
  person_id: string | null;
  person_name: string;
  role: string;
}

type HotelAssignment = {
  id: string;
  person_name: string | null;
  check_in: string | null;
  check_out: string | null;
  nights: number;
  room_type: string | null;
  room_number: string | null;
  confirmation: string | null;
  rate_per_night: number;
  notes: string | null;
};

interface RoomingViewProps {
  tourId: string;
  tourName: string;
  currency: string;
  routingDates: { id: string; date: string; venue_name?: string; city?: string; day_type?: string }[];
  hotels: {
    id: string;
    hotel_name: string;
    city?: string | null;
    address?: string | null;
    phone?: string | null;
    cancellation_policy?: string | null;
    distance_to_venue?: string | null;
    distance_to_airport?: string | null;
    room_assignments?: HotelAssignment[];
  }[];
  roster: RosterPerson[];
}

type ViewId = 'matrix' | 'nights' | 'cards';
const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'matrix', label: 'Matrix' },
  { id: 'nights', label: 'Nights' },
  { id: 'cards', label: 'Cards' },
];

export function RoomingView({ tourId, tourName, currency, routingDates, hotels, roster }: RoomingViewProps) {
  const [people, setPeople] = useState<RosterPerson[]>(roster);
  const [view, setView] = useState<ViewId>('matrix');
  const [hotelId, setHotelId] = useState<string | null>(null);

  const excludePersonIds = useMemo(
    () => people.map((r) => r.person_id).filter((id): id is string => typeof id === 'string'),
    [people],
  );
  // Nights away — every routing date except explicit home / no-tour days (Q2).
  const nights = useMemo(() => routingDates.filter((r) => isNightAway(r.day_type)), [routingDates]);
  const activeHotel = hotels.find((h) => h.id === hotelId) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <PageTitle style={{ fontSize: 22 }}>{tourName} — Rooming</PageTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <RoomingExportButton tourId={tourId} />
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
      </div>

      {/* view switcher (segmented control) */}
      <div
        role="tablist"
        aria-label="Rooming view"
        style={{
          display: 'inline-flex',
          alignSelf: 'flex-start',
          gap: 2,
          border: '1px solid var(--lp-border)',
          borderRadius: 'var(--lp-radius-full)',
          padding: 3,
          background: 'var(--lp-panel)',
        }}
      >
        {VIEWS.map((v) => {
          const on = view === v.id;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setView(v.id)}
              style={{
                border: 0,
                cursor: 'pointer',
                borderRadius: 'var(--lp-radius-full)',
                padding: '5px 16px',
                fontSize: 13,
                fontWeight: 600,
                background: on ? 'var(--lp-orange)' : 'transparent',
                color: on ? 'var(--lp-text-inverse)' : 'var(--lp-text-secondary)',
                transition: 'background 0.16s ease, color 0.16s ease',
              }}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      <div style={{ minHeight: 300 }}>
        {view === 'matrix' ? (
          <RoomingMatrix tourId={tourId} currency={currency} nights={nights} roster={people} />
        ) : view === 'cards' ? (
          <RoomingCards tourId={tourId} nights={nights} roster={people} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <RoomingNightsOverview hotels={hotels} currency={currency} selectedId={hotelId} onSelectHotel={setHotelId} />
            {activeHotel ? (
              <RoomingHotelSheet
                hotelBooking={activeHotel}
                roomAssignments={(activeHotel.room_assignments ?? []) as HotelAssignment[]}
                currency={currency}
              />
            ) : (
              <div style={{ fontSize: 12, color: 'var(--lp-text-tertiary)' }}>
                Click a hotel row to edit its rooms, rates + confirmation.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
