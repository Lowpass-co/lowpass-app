'use client';

/* ============================================
   LOWPASS — <VenueLibraryClient> (Venue SSOT — venue edit)

   Lists the workspace's canonical venues and edits them. Editing shows a
   PROPAGATION NOTICE — "N upcoming shows reference this venue" + the list — so
   the user knows exactly which live shows the edit flows into. Past/frozen shows
   are never listed and never change (their venue is snapshotted). Save PATCHes
   /api/venues/canonical/[id] (service-role write); the routing resolver picks up
   the new value on the next load.

   Deliberately plain — the design pass (run order 3) restyles this surface.
   ============================================ */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Pencil, Users } from 'lucide-react';
import { SlideOver } from '@/components/ui/SlideOver';
import { useToast } from '@/components/ui/Toast';

export interface VenueLibraryRow {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  capacity: number | null;
  upcomingCount: number;
}

interface UpcomingShow {
  routingId: string;
  date: string;
  city: string | null;
  tourId: string | null;
  tourName: string;
}

export function VenueLibraryClient({ venues }: { venues: VenueLibraryRow[] }) {
  const [editing, setEditing] = useState<VenueLibraryRow | null>(null);

  if (venues.length === 0) {
    return (
      <div
        className="rounded-xl border p-8 text-center"
        style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-panel)' }}
      >
        <MapPin className="mx-auto h-6 w-6" style={{ color: 'var(--lp-text-tertiary)' }} aria-hidden />
        <p className="mt-2" style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>
          No linked venues yet. Pick a venue from the routing autocomplete to add it to your library.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {venues.map((v) => (
          <li
            key={v.id}
            className="flex items-center gap-3 rounded-lg border px-4 py-3"
            style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-panel)' }}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate" style={{ fontWeight: 'var(--lp-weight-medium)', color: 'var(--lp-text)' }}>
                {v.name}
              </div>
              <div className="truncate" style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>
                {[v.city, v.country].filter(Boolean).join(', ') || '—'}
                {v.address ? ` · ${v.address}` : ''}
              </div>
            </div>
            {v.capacity != null ? (
              <span
                className="inline-flex shrink-0 items-center gap-1"
                style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}
              >
                <Users className="h-3.5 w-3.5" aria-hidden />
                {v.capacity.toLocaleString()}
              </span>
            ) : null}
            {v.upcomingCount > 0 ? (
              <span
                className="shrink-0 rounded-full px-2 py-0.5"
                style={{
                  fontSize: 'var(--lp-text-2xs)',
                  fontWeight: 'var(--lp-weight-medium)',
                  color: 'var(--color-lp-orange)',
                  background: 'color-mix(in srgb, var(--color-lp-orange) 12%, transparent)',
                }}
              >
                {v.upcomingCount} upcoming
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setEditing(v)}
              className="btn-transition inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1"
              style={{
                fontSize: 'var(--lp-text-xs)',
                color: 'var(--lp-text-secondary)',
                border: '1px solid var(--lp-border)',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit
            </button>
          </li>
        ))}
      </ul>

      {editing ? (
        <VenueEditSlideOver
          key={editing.id}
          venue={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function VenueEditSlideOver({ venue, onClose }: { venue: VenueLibraryRow; onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [name, setName] = useState(venue.name);
  const [address, setAddress] = useState(venue.address ?? '');
  const [city, setCity] = useState(venue.city ?? '');
  const [country, setCountry] = useState(venue.country ?? '');
  const [capacity, setCapacity] = useState(venue.capacity != null ? String(venue.capacity) : '');
  const [saving, setSaving] = useState(false);
  const [upcoming, setUpcoming] = useState<UpcomingShow[] | null>(null);

  // Load the propagation list on open (upcoming/live shows referencing this venue).
  useEffect(() => {
    let alive = true;
    fetch(`/api/venues/canonical/${venue.id}`)
      .then((r) => (r.ok ? r.json() : { upcomingShows: [] }))
      .then((d) => {
        if (alive) setUpcoming((d.upcomingShows as UpcomingShow[]) ?? []);
      })
      .catch(() => {
        if (alive) setUpcoming([]);
      });
    return () => {
      alive = false;
    };
  }, [venue.id]);

  const save = useCallback(async () => {
    if (saving) return;
    if (!name.trim()) {
      showToast('Name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/venues/canonical/${venue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim() || null,
          city: city.trim() || null,
          country: country.trim() || null,
          capacity: capacity.trim() ? Number(capacity) : null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === 'string' ? j.error : `Failed (${res.status})`);
      }
      showToast('Venue updated');
      onClose();
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error');
      setSaving(false);
    }
  }, [saving, name, address, city, country, capacity, venue.id, showToast, onClose, router]);

  const upcomingCount = upcoming?.length ?? venue.upcomingCount;

  return (
    <SlideOver
      open
      onClose={onClose}
      title="Edit venue"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-transition rounded-md px-3 py-1.5"
            style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)', border: '1px solid var(--lp-border)', background: 'transparent', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="btn-transition rounded-md px-3 py-1.5"
            style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text-inverse)', background: 'var(--color-lp-orange)', border: 0, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Address">
          <input value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} />
        </Field>
        <div className="flex gap-3">
          <Field label="City">
            <input value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Country">
            <input value={country} onChange={(e) => setCountry(e.target.value)} style={inputStyle} />
          </Field>
        </div>
        <Field label="Capacity">
          <input
            value={capacity}
            onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            style={inputStyle}
          />
        </Field>

        {/* Propagation notice */}
        <div
          className="rounded-lg border p-3"
          style={{
            borderColor: 'var(--color-lp-warning)',
            background: 'color-mix(in srgb, var(--color-lp-warning) 8%, transparent)',
          }}
        >
          <div style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-medium)', color: 'var(--lp-text)' }}>
            {upcomingCount === 0
              ? 'No upcoming shows reference this venue — this edit affects future picks only.'
              : `${upcomingCount} upcoming show${upcomingCount === 1 ? '' : 's'} reference this venue and will reflect this edit:`}
          </div>
          {upcoming && upcoming.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {upcoming.map((s) => (
                <li key={s.routingId} style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>
                  {s.date} · {s.tourName}
                  {s.city ? ` · ${s.city}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-2" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
            Past and frozen shows keep their saved venue snapshot and are not changed.
          </div>
        </div>
      </div>
    </SlideOver>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  fontSize: 'var(--lp-text-sm)',
  color: 'var(--lp-text)',
  background: 'var(--lp-surface)',
  border: '1px solid var(--lp-border)',
  borderRadius: 'var(--lp-radius-md)',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)', fontWeight: 'var(--lp-weight-medium)' }}>
        {label}
      </span>
      {children}
    </label>
  );
}
