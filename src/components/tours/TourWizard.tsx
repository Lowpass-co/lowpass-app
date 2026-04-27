/* ============================================
   LOWPASS — Tour Creation Wizard

   Single-step form: artist, name, dates,
   continent, currency, crew/band counts.
   ============================================ */

'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Info, ChevronDown, Check } from 'lucide-react';
import type { Artist } from '@/types';
import type { Continent } from '@/types';
import { ArtistNewBlock, ArtistLogoField, type NewArtistPayload } from '@/components/artists/ArtistNewBlock';
import { ArtistPreviewCard } from '@/components/artists/ArtistPreviewCard';
import { SlidingToggle } from '@/components/ui/SlidingToggle';
import { StyledSelect } from '@/components/ui/StyledSelect';
import { cn } from '@/lib/utils';

const CONTINENTS: { value: Continent; label: string }[] = [
  { value: 'GLOBAL', label: 'Global' },
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

interface TourWizardProps {
  initialTourId?: string;
}

export function TourWizard({ initialTourId }: TourWizardProps) {
  const router = useRouter();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loadingArtists, setLoadingArtists] = useState(true);
  const [loadingTour, setLoadingTour] = useState(!!initialTourId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [artistChoice, setArtistChoice] = useState<'existing' | 'new'>('existing');
  const [artistId, setArtistId] = useState('');
  const [existingArtistLogoOverrides, setExistingArtistLogoOverrides] = useState<Record<string, string>>({});
  const [newArtistPayload, setNewArtistPayload] = useState<NewArtistPayload>({ name: '' });
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [continents, setContinents] = useState<Continent[]>(['UK']);
  const [currencyInfoOpen, setCurrencyInfoOpen] = useState(false);
  const currencyInfoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (currencyInfoRef.current && !currencyInfoRef.current.contains(e.target as Node)) setCurrencyInfoOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  const [currency, setCurrency] = useState('GBP');
  const [principalCount, setPrincipalCount] = useState('0');
  const [bandCount, setBandCount] = useState('0');
  const [crewCount, setCrewCount] = useState('0');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dateToast, setDateToast] = useState<string | null>(null);
  const dateToastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!dateToast) return;
    if (dateToastRef.current) clearTimeout(dateToastRef.current);
    dateToastRef.current = setTimeout(() => setDateToast(null), 5000);
    return () => {
      if (dateToastRef.current) clearTimeout(dateToastRef.current);
    };
  }, [dateToast]);

  const validateDates = (start: string, end: string): string | null => {
    if (!start || !end) return null;
    if (end < start) return 'End date cannot be before start date';
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    const days = Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000));
    if (days > 365) return 'Tour length cannot exceed 365 days';
    return null;
  };

  useEffect(() => {
    if (!initialTourId) return;
    fetch(`/api/tours/${initialTourId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((tour: { artist_id?: string; artist?: Artist; name?: string; start_date?: string; end_date?: string; continent?: Continent; currency?: string; principal_count?: number; band_count?: number; crew_count?: number } | null) => {
        if (!tour) {
          setLoadingTour(false);
          return;
        }
        setArtistId(tour.artist_id ?? '');
        setArtistChoice('existing');
        setName(tour.name ?? '');
        setStartDate(tour.start_date ?? '');
        setEndDate(tour.end_date ?? '');
        const c = tour.continent;
        setContinents(typeof c === 'string' && c ? c.split(',').filter(Boolean) as Continent[] : ['UK']);
        setCurrency(tour.currency ?? 'GBP');
        setPrincipalCount(String(tour.principal_count ?? 0));
        setBandCount(String(tour.band_count ?? 0));
        setCrewCount(String(tour.crew_count ?? 0));
        setLoadingTour(false);
      })
      .catch(() => setLoadingTour(false));
  }, [initialTourId]);

  function validate(): Record<string, string> {
    const err: Record<string, string> = {};
    if (!name.trim()) err.name = 'Tour name is required';
    else if (name.trim().length < 2) err.name = 'Tour name must be at least 2 characters';
    if (artistChoice === 'existing' && !artistId) err.artist = 'Select an artist';
    if (artistChoice === 'new' && !newArtistPayload.name.trim()) err.artist = 'Enter artist name';
    const dateErr = validateDates(startDate, endDate);
    if (dateErr) err.dates = dateErr;
    if (!currency) err.currency = 'Select a currency';
    return err;
  }

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
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      let resolvedArtistId = artistId;
      if (artistChoice === 'new') {
        if (!newArtistPayload.name.trim()) {
          setErrors((prev) => ({ ...prev, artist: 'Enter artist name' }));
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
        setSubmitting(false);
        return;
      }

      // If existing artist and logo was changed, persist it
      if (artistChoice === 'existing' && resolvedArtistId) {
        const selected = artists.find((a) => a.id === resolvedArtistId);
        const branding = selected?.branding ?? {};
        const logoOverride = existingArtistLogoOverrides[resolvedArtistId];
        const logoToSave = logoOverride ?? branding.logo_url;
        if (logoOverride !== undefined && logoToSave !== branding.logo_url) {
          await fetch(`/api/artists/${resolvedArtistId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ logo_url: logoToSave ?? null }),
          });
        }
      }

      if (!name.trim() || !startDate || !endDate) {
        setSubmitting(false);
        return;
      }

      const tourId = initialTourId;
      if (tourId) {
        const tourRes = await fetch(`/api/tours/${tourId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            artist_id: resolvedArtistId,
            name: name.trim(),
            start_date: startDate,
            end_date: endDate,
            continent: continents.length ? continents.join(',') : 'UK',
            currency,
            principal_count: parseInt(principalCount, 10) || 0,
            band_count: parseInt(bandCount, 10) || 0,
            crew_count: parseInt(crewCount, 10) || 0,
          }),
        });
        if (!tourRes.ok) {
          const err = await tourRes.json();
          throw new Error(err.error || 'Failed to update tour');
        }
        router.push(`/tours/${tourId}?toast=tour_updated`);
        router.refresh();
      } else {
        const tourRes = await fetch('/api/tours', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            artist_id: resolvedArtistId,
            name: name.trim(),
            start_date: startDate,
            end_date: endDate,
            continent: continents.length ? continents.join(',') : 'UK',
            currency,
            principal_count: parseInt(principalCount, 10) || 0,
            band_count: parseInt(bandCount, 10) || 0,
            crew_count: parseInt(crewCount, 10) || 0,
          }),
        });
        if (!tourRes.ok) {
          const err = await tourRes.json();
          throw new Error(err.error || 'Failed to create tour');
        }
        const tour = await tourRes.json();
        // Full navigation + sync saved scope so the sidebar does not keep the previous tour selected.
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('lp-selected-tour', tour.id);
            localStorage.setItem('lp-selected-artist', resolvedArtistId);
          } catch {
            /* ignore */
          }
          window.location.assign(`/tours/${tour.id}?toast=tour_created`);
        } else {
          router.push(`/tours/${tour.id}?toast=tour_created`);
          router.refresh();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      {loadingTour && (
        <p className="text-sm text-lp-text-tertiary">Loading tour…</p>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </div>
      )}

      <section className="space-y-5">
        <h2 className="text-sm font-medium uppercase tracking-wider text-lp-text-tertiary">
          Artist
        </h2>
        <SlidingToggle
          value={artistChoice}
          onChange={(v) => setArtistChoice(v)}
          options={['existing', 'new']}
          labels={['Existing artist', 'New artist']}
        />

        {artistChoice === 'existing' && (
          <div className="space-y-4">
            <StyledSelect
              value={artistId}
              onChange={(v) => { setArtistId(v); setErrors((prev) => ({ ...prev, artist: '' })); }}
              options={artists.map((a) => ({ value: a.id, label: a.name ?? '—' }))}
              placeholder="Select an artist"
              disabled={loadingArtists}
              error={!!errors.artist}
            />
            {errors.artist && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.artist}</p>}
            {artistId && (() => {
              const selected = artists.find((a) => a.id === artistId);
              if (!selected) return null;
              const branding = (selected as Artist & { branding?: { logo_url?: string } }).branding ?? {};
              const displayImage = selected.spotify_image_url ?? branding.logo_url;
              const logoUrl = existingArtistLogoOverrides[artistId] ?? branding.logo_url;
              return (
                <div className="mt-4 space-y-6">
                  <ArtistPreviewCard
                    imageUrl={displayImage}
                    name={selected.name}
                    viaLabel={selected.spotify_id ? 'Via Spotify' : undefined}
                    onChangeArtist={() => setArtistId('')}
                  />
                  <ArtistLogoField
                    logoUrl={logoUrl}
                    onChange={(url) => setExistingArtistLogoOverrides((prev) => ({ ...prev, [artistId]: url }))}
                  />
                </div>
              );
            })()}
          </div>
        )}

        {artistChoice === 'new' && (
          <ArtistNewBlock value={newArtistPayload} onChange={(p) => { setNewArtistPayload(p); if (p.name.trim()) setErrors((prev) => ({ ...prev, artist: '' })); }} />
        )}
      </section>

      <section className="space-y-5">
        <h2 className="text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">
          Tour details
        </h2>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">Tour name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setErrors((prev) => ({ ...prev, name: '' })); }}
            placeholder="e.g. Summer 2026"
            className={`h-11 w-full rounded-lg border bg-lp-surface/50 px-3.5 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:outline-none focus:ring-2 focus:ring-lp-orange/20 ${errors.name ? 'border-red-500 focus:border-red-500' : 'border-lp-border focus:border-lp-orange'}`}
            required
          />
          {errors.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.name}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                const v = e.target.value;
                setStartDate(v);
                setErrors((prev) => ({ ...prev, dates: '' }));
                const msg = validateDates(v, endDate);
                if (msg) setDateToast(msg);
                else setDateToast(null);
              }}
              className={`h-11 w-full rounded-lg border bg-lp-surface/50 px-3.5 text-sm text-lp-text focus:outline-none focus:ring-2 focus:ring-lp-orange/20 ${errors.dates ? 'border-red-500 focus:border-red-500' : 'border-lp-border focus:border-lp-orange'}`}
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">End date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                const v = e.target.value;
                setEndDate(v);
                setErrors((prev) => ({ ...prev, dates: '' }));
                const msg = validateDates(startDate, v);
                if (msg) setDateToast(msg);
                else setDateToast(null);
              }}
              className={`h-11 w-full rounded-lg border bg-lp-surface/50 px-3.5 text-sm text-lp-text focus:outline-none focus:ring-2 focus:ring-lp-orange/20 ${errors.dates ? 'border-red-500 focus:border-red-500' : 'border-lp-border focus:border-lp-orange'}`}
              required
            />
          </div>
          {errors.dates && <p className="col-span-2 mt-1 text-xs text-red-600 dark:text-red-400">{errors.dates}</p>}
          {dateToast && !errors.dates && (
            <div
              className="col-span-2 mt-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 transition-opacity duration-300"
              onMouseEnter={() => { if (dateToastRef.current) clearTimeout(dateToastRef.current); dateToastRef.current = null; }}
            >
              {dateToast}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ContinentMultiSelect
            continents={continents}
            onChange={setContinents}
            options={CONTINENTS}
          />
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">
              Currency
              <span className="relative" ref={currencyInfoRef}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setCurrencyInfoOpen((o) => !o); }}
                  className="rounded p-0.5 text-lp-text-tertiary hover:text-lp-text-secondary focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
                  aria-label="Currency info"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
                {currencyInfoOpen && (
                  <div
                    className="absolute left-0 top-full z-10 mt-1 w-72 rounded-lg border border-lp-border bg-lp-surface p-3 text-xs text-lp-text-secondary shadow-lg"
                    onMouseLeave={() => setCurrencyInfoOpen(false)}
                  >
                    Primary currency for budgeting. The app will convert expenses entered in other currencies into this primary currency in real time.
                  </div>
                )}
              </span>
            </label>
            <StyledSelect
              value={currency}
              onChange={(v) => { setCurrency(v); setErrors((prev) => ({ ...prev, currency: '' })); }}
              options={CURRENCIES.map((c) => ({ value: c.value, label: c.label }))}
              placeholder="Select currency"
              error={!!errors.currency}
            />
            {errors.currency && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.currency}</p>}
          </div>
        </div>
        <div className="flex flex-col items-center">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">Principal artists / Band / Crew</p>
          <div className="flex items-end justify-center gap-6">
            <div className="flex flex-col items-center">
              <label className="mb-1.5 text-xs font-medium text-lp-text-tertiary">Principal</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={principalCount}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '');
                  setPrincipalCount(v);
                }}
                className="h-11 w-20 rounded-lg border border-lp-border bg-lp-surface/50 px-3 py-2 text-center text-lg tabular-nums text-lp-text focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <div className="flex flex-col items-center">
              <label className="mb-1.5 text-xs font-medium text-lp-text-tertiary">Band</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={bandCount}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '');
                  setBandCount(v);
                }}
                className="h-11 w-20 rounded-lg border border-lp-border bg-lp-surface/50 px-3 py-2 text-center text-lg tabular-nums text-lp-text focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <div className="flex flex-col items-center">
              <label className="mb-1.5 text-xs font-medium text-lp-text-tertiary">Crew</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={crewCount}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '');
                  setCrewCount(v);
                }}
                className="h-11 w-20 rounded-lg border border-lp-border bg-lp-surface/50 px-3 py-2 text-center text-lg tabular-nums text-lp-text focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          disabled={submitting || loadingTour}
          className="rounded-xl bg-lp-orange px-6 py-3 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50 transition-colors"
        >
          {submitting ? (initialTourId ? 'Saving…' : 'Creating…') : (initialTourId ? 'Save changes' : 'Create tour')}
        </button>
        <Link
          href="/tours"
          className="rounded-xl border border-lp-border bg-lp-surface px-6 py-3 text-sm font-medium text-lp-text hover:bg-lp-surface-hover transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function ContinentMultiSelect({
  continents,
  onChange,
  options,
}: {
  continents: Continent[];
  onChange: (c: Continent[]) => void;
  options: { value: Continent; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const displayLabel =
    continents.length === 0
      ? 'Select territories'
      : continents.includes('GLOBAL')
        ? 'Global'
        : options.filter((o) => continents.includes(o.value)).map((o) => o.label).join(', ');

  const toggle = (value: Continent) => {
    if (value === 'GLOBAL') {
      onChange(['GLOBAL']);
      return;
    }
    const next = continents.filter((c) => c !== 'GLOBAL');
    if (next.includes(value)) {
      const n = next.filter((c) => c !== value);
      onChange(n.length ? n : ['UK']);
    } else {
      onChange([...next, value]);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">
        Continent / territories
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-11 w-full items-center justify-between rounded-xl border bg-lp-surface px-4 py-2.5 text-left text-sm text-lp-text transition-all duration-150',
          open && 'ring-2 ring-lp-orange/20',
          'border-lp-border focus:border-lp-orange'
        )}
      >
        <span className={continents.length ? '' : 'text-lp-text-tertiary'}>{displayLabel}</span>
        <ChevronDown size={16} className={cn('shrink-0 text-lp-text-tertiary transition-transform duration-150', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-1 shadow-xl">
          {options.map((opt) => {
            const selected = continents.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition-colors',
                  selected ? 'bg-lp-orange/10 text-lp-text' : 'text-lp-text hover:bg-lp-surface-hover'
                )}
              >
                <span>{opt.label}</span>
                {selected && <Check size={16} className="shrink-0 text-lp-orange" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
