/* ============================================
   LOWPASS — Tour Creation Wizard

   Single-step form: artist, name, dates,
   continent, currency, crew/band counts.
   ============================================ */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Artist } from '@/types';
import type { Continent } from '@/types';
import { ArtistNewBlock, type NewArtistPayload } from '@/components/artists/ArtistNewBlock';

const CONTINENTS: { value: Continent; label: string }[] = [
  { value: 'US', label: 'US' },
  { value: 'UK', label: 'UK' },
  { value: 'EU', label: 'EU' },
  { value: 'AUS', label: 'AUS' },
  { value: 'ASIA', label: 'ASIA' },
  { value: 'OTHER', label: 'Other' },
];

const CURRENCIES = [
  { value: 'GBP', label: '£ GBP' },
  { value: 'USD', label: '$ USD' },
  { value: 'EUR', label: '€ EUR' },
  { value: 'AUD', label: 'A$ AUD' },
];

export function TourWizard() {
  const router = useRouter();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loadingArtists, setLoadingArtists] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [artistChoice, setArtistChoice] = useState<'existing' | 'new'>('existing');
  const [artistId, setArtistId] = useState('');
  const [newArtistPayload, setNewArtistPayload] = useState<NewArtistPayload>({ name: '' });
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [continent, setContinent] = useState<Continent>('UK');
  const [currency, setCurrency] = useState('GBP');
  const [principalCount, setPrincipalCount] = useState(0);
  const [bandCount, setBandCount] = useState(0);
  const [crewCount, setCrewCount] = useState(0);

  useEffect(() => {
    fetch('/api/artists')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setArtists(data);
        setLoadingArtists(false);
      })
      .catch(() => setLoadingArtists(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      let resolvedArtistId = artistId;
      if (artistChoice === 'new') {
        if (!newArtistPayload.name.trim()) {
          setError('Enter artist name');
          setSubmitting(false);
          return;
        }
        const createRes = await fetch('/api/artists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newArtistPayload.name.trim(),
            ...(newArtistPayload.spotify_id && { spotify_id: newArtistPayload.spotify_id }),
            ...(newArtistPayload.spotify_image_url && { spotify_image_url: newArtistPayload.spotify_image_url }),
            ...(newArtistPayload.spotify_banner_url && { spotify_banner_url: newArtistPayload.spotify_banner_url }),
            branding: {
              ...(newArtistPayload.logo_url && { logo_url: newArtistPayload.logo_url }),
              ...(newArtistPayload.banner_url && { banner_url: newArtistPayload.banner_url }),
            },
          }),
        });
        if (!createRes.ok) {
          const err = await createRes.json();
          throw new Error(err.error || 'Failed to create artist');
        }
        const newArtist = await createRes.json();
        resolvedArtistId = newArtist.id;
      } else if (!resolvedArtistId) {
        setError('Select an artist');
        setSubmitting(false);
        return;
      }

      if (!name.trim() || !startDate || !endDate) {
        setError('Name and dates are required');
        setSubmitting(false);
        return;
      }

      const tourRes = await fetch('/api/tours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist_id: resolvedArtistId,
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
          continent,
          currency,
          principal_count: principalCount,
          band_count: bandCount,
          crew_count: crewCount,
        }),
      });

      if (!tourRes.ok) {
        const err = await tourRes.json();
        throw new Error(err.error || 'Failed to create tour');
      }
      const tour = await tourRes.json();
      router.push(`/tours/${tour.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/tours"
          className="flex items-center gap-1 text-sm text-lp-text-secondary hover:text-lp-text"
        >
          <ArrowLeft size={16} />
          Back
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-lp-text">Artist</h2>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="artistChoice"
              checked={artistChoice === 'existing'}
              onChange={() => setArtistChoice('existing')}
              className="text-lp-orange focus:ring-lp-orange"
            />
            <span className="text-sm text-lp-text">Existing</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="artistChoice"
              checked={artistChoice === 'new'}
              onChange={() => setArtistChoice('new')}
              className="text-lp-orange focus:ring-lp-orange"
            />
            <span className="text-sm text-lp-text">New artist</span>
          </label>
        </div>
        {artistChoice === 'existing' ? (
          <select
            value={artistId}
            onChange={(e) => setArtistId(e.target.value)}
            className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
            required={artistChoice === 'existing'}
            disabled={loadingArtists}
          >
            <option value="">Select artist…</option>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        ) : (
          <ArtistNewBlock value={newArtistPayload} onChange={setNewArtistPayload} />
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-lp-text">Tour details</h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-lp-text-secondary">Tour name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Summer Tour 2026"
            className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-lp-text-secondary">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-lp-text-secondary">End date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
              required
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-lp-text-secondary">Continent</label>
            <select
              value={continent}
              onChange={(e) => setContinent(e.target.value as Continent)}
              className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
            >
              {CONTINENTS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-lp-text-secondary">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-lp-text-secondary">Principal artists</label>
            <input
              type="number"
              min={0}
              value={principalCount}
              onChange={(e) => setPrincipalCount(parseInt(e.target.value, 10) || 0)}
              className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-lp-text-secondary">Band members</label>
            <input
              type="number"
              min={0}
              value={bandCount}
              onChange={(e) => setBandCount(parseInt(e.target.value, 10) || 0)}
              className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-lp-text-secondary">Crew</label>
            <input
              type="number"
              min={0}
              value={crewCount}
              onChange={(e) => setCrewCount(parseInt(e.target.value, 10) || 0)}
              className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-lp-orange px-4 py-2.5 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create tour'}
        </button>
        <Link
          href="/tours"
          className="rounded-lg border border-lp-border bg-lp-surface px-4 py-2.5 text-sm font-medium text-lp-text hover:bg-lp-surface-hover"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
