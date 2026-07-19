/* ============================================
   LOWPASS — <ArtistCreateSlideOver> (AB — Artist Builder rebuild)

   The canonical create-artist flow, opened from the workspace /artists page,
   the artist/tour switcher's "+ Create new artist" CTA, and the dashboard
   pick-artist gate. A three-step wizard inside the <SlideOver> primitive:

     Step 1 · Find    — Spotify search-as-you-type (debounced). Pick a result.
     Step 2 · Confirm — proves the right artist before committing.
     Step 3 · Details — Display name + default currency (both optional).

   THE DECOUPLING (Adam's reported bug): the Step-1 Next button enables from
   ONLY this flow's local `selected !== null`. It never reads ArtistTourContext,
   the selected-artist pill, or any ambient/global selection. See smoke AB-02.

   Wiring: POST /api/artists (existing route — accepts name, spotify_*, and a
   branding JSONB into which we tuck `genre` + `default_currency`, since the
   artists table has no currency column). Spotify search runs server-side via
   /api/spotify/search (no client credential path). Manual-path artists save
   with a null spotify id and degrade gracefully everywhere.
   ============================================ */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Check, ArrowLeft } from 'lucide-react';
import { SlideOver } from '@/components/shell/SlideOver';
import { useToast } from '@/components/ui/Toast';
import { StyledSelect } from '@/components/ui/StyledSelect';
import { TOUR_CURRENCIES, DEFAULT_TOUR_CURRENCY } from '@/lib/currencies';

interface SpotifyArtist {
  id: string;
  name: string;
  image_url: string | null;
  banner_url: string | null;
  genres: string[];
  followers: number | null;
  popularity: number | null;
}

interface ArtistCreateSlideOverProps {
  open: boolean;
  onClose: () => void;
  /** Fired with the freshly-created artist's lean projection so the wrapper can
   *  optimistically prepend it to the switcher list AND navigate to
   *  /artists/[new-id]. Mirrors TourCreateSlideOver's onCreated shape. */
  onCreated?: (artist: {
    id: string;
    name: string;
    branding: unknown;
    spotify_id: string | null;
    spotify_image_url: string | null;
  }) => void;
}

const SEARCH_DEBOUNCE_MS = 265; // within the spec's 250–280ms band

export function ArtistCreateSlideOver({
  open,
  onClose,
  onCreated,
}: ArtistCreateSlideOverProps) {
  // Re-mount the inner on `open` flip so per-open state resets without a
  // useEffect setState (same key trick as TourCreateSlideOver).
  return (
    <ArtistCreateSlideOverInner
      key={open ? 'open' : 'closed'}
      open={open}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}

type Step = 1 | 2 | 3;

function ArtistCreateSlideOverInner({
  open,
  onClose,
  onCreated,
}: ArtistCreateSlideOverProps) {
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>(1);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotifyArtist[]>([]);
  const [searching, setSearching] = useState(false);
  const [lastSearched, setLastSearched] = useState<string | null>(null);
  // THE local selection — the Step-1 Next button derives ONLY from this.
  const [selected, setSelected] = useState<SpotifyArtist | null>(null);
  const [manual, setManual] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [currency, setCurrency] = useState<string>(DEFAULT_TOUR_CURRENCY);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus the search input when the Find step mounts.
  useEffect(() => {
    if (step === 1) inputRef.current?.focus();
  }, [step]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const runSearch = useCallback(async (q: string) => {
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        setResults([]);
        setLastSearched(q);
        setSearching(false);
        return;
      }
      const data = (await res.json()) as SpotifyArtist[];
      setResults(Array.isArray(data) ? data : []);
      setLastSearched(q);
      setSearching(false);
    } catch {
      setResults([]);
      setLastSearched(q);
      setSearching(false);
    }
  }, []);

  const onQueryChange = useCallback(
    (next: string) => {
      setQuery(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const trimmed = next.trim();
      if (trimmed.length < 1) {
        setResults([]);
        setSearching(false);
        setLastSearched(null);
        return;
      }
      // Search-as-you-type: any non-empty query, debounced. The "Searching…"
      // affordance shows immediately so we never flash "add manually" before
      // results have had their chance (same rule as the venue autocomplete).
      setSearching(true);
      debounceRef.current = setTimeout(() => runSearch(trimmed), SEARCH_DEBOUNCE_MS);
    },
    [runSearch],
  );

  const pick = useCallback((a: SpotifyArtist) => {
    setSelected(a);
  }, []);

  const goManual = useCallback(() => {
    setManual(true);
    setSelected(null);
    setDisplayName(query.trim());
    setStep(3);
  }, [query]);

  const toConfirm = useCallback(() => {
    if (!selected) return;
    setStep(2);
  }, [selected]);

  const toDetails = useCallback(() => {
    setDisplayName((prev) => prev || selected?.name || query.trim());
    setStep(3);
  }, [selected, query]);

  const searchAgain = useCallback(() => {
    setSelected(null);
    setManual(false);
    setStep(1);
    // Focus is restored by the step-1 effect.
  }, []);

  const trimmedName = displayName.trim();
  const canCreate = !!trimmedName && !submitting;

  const create = useCallback(async () => {
    if (!canCreate) return;
    setSubmitting(true);
    setError(null);
    try {
      const branding: Record<string, unknown> = { default_currency: currency };
      const primaryGenre = selected?.genres?.[0];
      if (primaryGenre) branding.genre = primaryGenre;

      const payload: Record<string, unknown> = {
        name: trimmedName,
        branding,
      };
      if (selected) {
        payload.spotify_id = selected.id;
        if (selected.image_url) payload.spotify_image_url = selected.image_url;
        if (selected.banner_url) payload.spotify_banner_url = selected.banner_url;
      }

      const res = await fetch('/api/artists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as
        | {
            error?: string;
            id?: string;
            name?: string;
            branding?: unknown;
            spotify_id?: string | null;
            spotify_image_url?: string | null;
          }
        | null;
      if (!res.ok) {
        setError(body?.error ?? `Create failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      const newId = body?.id;
      if (newId) {
        onCreated?.({
          id: newId,
          name: body?.name ?? trimmedName,
          branding: body?.branding ?? branding,
          spotify_id: body?.spotify_id ?? selected?.id ?? null,
          spotify_image_url: body?.spotify_image_url ?? selected?.image_url ?? null,
        });
      }
      showToast('Artist created');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setSubmitting(false);
    }
  }, [canCreate, currency, selected, trimmedName, onCreated, showToast, onClose]);

  /* -------- footer per step -------- */
  const footer = (
    <div className="flex items-center justify-between" style={{ gap: 'var(--lp-space-3)' }}>
      <div>
        {step > 1 ? (
          <FooterButton
            onClick={() => setStep(selected && !manual ? (step === 3 ? 2 : 1) : 1)}
            variant="ghost"
            icon={<ArrowLeft size={14} strokeWidth={2.4} />}
          >
            Back
          </FooterButton>
        ) : null}
      </div>
      <div className="flex items-center" style={{ gap: 'var(--lp-space-2)' }}>
        <FooterButton onClick={onClose} variant="ghost">
          Cancel
        </FooterButton>
        {step === 1 ? (
          <FooterButton onClick={toConfirm} variant="primary" disabled={!selected}>
            Next
          </FooterButton>
        ) : step === 2 ? (
          <FooterButton onClick={toDetails} variant="primary">
            Next
          </FooterButton>
        ) : (
          <FooterButton onClick={() => void create()} variant="primary" disabled={!canCreate}>
            {submitting ? 'Creating…' : 'Create artist'}
          </FooterButton>
        )}
      </div>
    </div>
  );

  return (
    <SlideOver open={open} onClose={onClose} title="New artist" footer={footer}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-4)', padding: 'var(--lp-space-4)' }}>
        <StepTabs step={step} hasSelected={!!selected && !manual} />

        {error ? (
          <div
            role="alert"
            style={{
              padding: 'var(--lp-space-3)',
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--color-lp-error)',
              background: 'color-mix(in srgb, var(--color-lp-error) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-lp-error) 25%, transparent)',
              borderRadius: 'var(--lp-radius-md)',
            }}
          >
            {error}
          </div>
        ) : null}

        {step === 1 ? (
          <FindStep
            query={query}
            onQueryChange={onQueryChange}
            results={results}
            searching={searching}
            lastSearched={lastSearched}
            selected={selected}
            onPick={pick}
            onManual={goManual}
            inputRef={inputRef}
          />
        ) : step === 2 && selected ? (
          <ConfirmStep artist={selected} onSearchAgain={searchAgain} />
        ) : (
          <DetailsStep
            selected={manual ? null : selected}
            displayName={displayName}
            onDisplayName={setDisplayName}
            currency={currency}
            onCurrency={setCurrency}
          />
        )}
      </div>
    </SlideOver>
  );
}

/* ============================================================
   Step chrome
   ============================================================ */

const STEP_LABELS: { n: Step; label: string }[] = [
  { n: 1, label: 'Find' },
  { n: 2, label: 'Confirm' },
  { n: 3, label: 'Details' },
];

function StepTabs({ step, hasSelected }: { step: Step; hasSelected: boolean }) {
  return (
    <div className="flex items-center justify-between" style={{ gap: 'var(--lp-space-2)' }}>
      <div className="flex items-center" style={{ gap: 'var(--lp-space-3)' }}>
        {STEP_LABELS.map(({ n, label }) => {
          const active = n === step;
          const done = n < step && (n !== 2 || hasSelected);
          return (
            <span
              key={n}
              className="lp-label-caps"
              style={{
                fontSize: 'var(--lp-text-2xs)',
                fontWeight: active ? 'var(--lp-weight-semibold)' : 'var(--lp-weight-medium)',
                color: active
                  ? 'var(--color-lp-orange)'
                  : done
                    ? 'var(--lp-text-secondary)'
                    : 'var(--lp-text-tertiary)',
                borderBottom: active ? '2px solid var(--color-lp-orange)' : '2px solid transparent',
                paddingBottom: 2,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {done ? <Check size={11} strokeWidth={3} /> : null}
              {label}
            </span>
          );
        })}
      </div>
      <span
        className="lp-mono"
        style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)', letterSpacing: '0.06em' }}
      >
        STEP {step} OF 3
      </span>
    </div>
  );
}

/* ============================================================
   Step 1 · Find
   ============================================================ */

function FindStep({
  query,
  onQueryChange,
  results,
  searching,
  lastSearched,
  selected,
  onPick,
  onManual,
  inputRef,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  results: SpotifyArtist[];
  searching: boolean;
  lastSearched: string | null;
  selected: SpotifyArtist | null;
  onPick: (a: SpotifyArtist) => void;
  onManual: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const trimmed = query.trim();
  const noMatches = !searching && trimmed.length >= 1 && results.length === 0 && lastSearched === trimmed;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-3)' }}>
      <p style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)', margin: 0 }}>
        Search Spotify to link artwork, genres and release history automatically.
        <br />
        <button
          type="button"
          onClick={onManual}
          className="btn-transition"
          style={{
            marginTop: 4,
            padding: 0,
            fontSize: 'var(--lp-text-sm)',
            fontWeight: 'var(--lp-weight-medium)',
            color: 'var(--color-lp-orange)',
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
          }}
        >
          Not on Spotify? Add manually →
        </button>
      </p>

      {/* Search input */}
      <div
        className="flex items-center"
        style={{
          gap: 'var(--lp-space-2)',
          padding: '0 var(--lp-space-3)',
          height: 42,
          background: 'var(--lp-surface)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 'var(--lp-radius-md)',
        }}
      >
        <Search size={16} strokeWidth={2.2} style={{ color: 'var(--lp-text-tertiary)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search for an artist…"
          autoComplete="off"
          spellCheck={false}
          style={{
            flex: 1,
            minWidth: 0,
            height: '100%',
            border: 0,
            outline: 'none',
            background: 'transparent',
            color: 'var(--lp-text)',
            fontSize: 'var(--lp-text-base)',
          }}
        />
      </div>

      {/* Results / states */}
      {searching ? (
        <div style={{ padding: 'var(--lp-space-3)', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)' }}>
          Searching…
        </div>
      ) : results.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {results.map((a) => (
            <ResultRow key={a.id} artist={a} selected={selected?.id === a.id} onClick={() => onPick(a)} />
          ))}
        </div>
      ) : noMatches ? (
        <button
          type="button"
          onClick={onManual}
          className="btn-transition"
          style={{
            textAlign: 'left',
            padding: 'var(--lp-space-3)',
            background: 'var(--lp-surface)',
            border: '1px dashed var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>
            No Spotify matches. Add{' '}
            <strong style={{ fontWeight: 'var(--lp-weight-semibold)' }}>“{trimmed}”</strong> manually →
          </span>
        </button>
      ) : null}
    </div>
  );
}

function ResultRow({
  artist,
  selected,
  onClick,
}: {
  artist: SpotifyArtist;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-transition flex w-full items-center"
      style={{
        gap: 'var(--lp-space-3)',
        padding: '8px var(--lp-space-3)',
        textAlign: 'left',
        background: selected ? 'color-mix(in srgb, var(--color-lp-orange) 8%, transparent)' : 'var(--lp-surface)',
        border: `1px solid ${selected ? 'var(--color-lp-orange)' : 'var(--lp-border-subtle)'}`,
        borderRadius: 'var(--lp-radius-md)',
        cursor: 'pointer',
      }}
    >
      <Artwork url={artist.image_url} name={artist.name} size={46} radius={6} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 14.5,
            fontWeight: 'var(--lp-weight-medium)',
            color: 'var(--lp-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {artist.name}
        </span>
        {artist.genres.length > 0 ? (
          <span
            style={{
              display: 'block',
              fontSize: 11.5,
              color: 'var(--lp-text-tertiary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {artist.genres.slice(0, 2).join(' · ')}
          </span>
        ) : null}
      </span>
      {artist.followers != null ? (
        <span
          className="lp-mono"
          style={{ flexShrink: 0, fontSize: 11.5, color: 'var(--lp-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}
        >
          {artist.followers.toLocaleString()}
        </span>
      ) : null}
      {selected ? (
        <Check size={16} strokeWidth={2.6} style={{ flexShrink: 0, color: 'var(--color-lp-orange)' }} />
      ) : null}
    </button>
  );
}

/* ============================================================
   Step 2 · Confirm
   ============================================================ */

function ConfirmStep({ artist, onSearchAgain }: { artist: SpotifyArtist; onSearchAgain: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-4)', alignItems: 'center', textAlign: 'center' }}>
      <Artwork url={artist.image_url} name={artist.name} size={132} radius={12} />
      <div>
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--lp-font-condensed)',
            fontSize: 26,
            fontWeight: 'var(--lp-weight-bold)',
            letterSpacing: '0.01em',
            color: 'var(--lp-text)',
          }}
        >
          {artist.name}
        </h2>
        {artist.genres.length > 0 ? (
          <div className="flex flex-wrap items-center justify-center" style={{ gap: 6, marginTop: 8 }}>
            {artist.genres.slice(0, 4).map((g) => (
              <span
                key={g}
                style={{
                  padding: '2px 8px',
                  fontSize: 'var(--lp-text-2xs)',
                  color: 'var(--lp-text-secondary)',
                  background: 'var(--lp-surface-hover)',
                  border: '1px solid var(--lp-border-subtle)',
                  borderRadius: 999,
                }}
              >
                {g}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Stats degrade gracefully: Spotify only returns followers/popularity to
          apps with extended access, so we render only the values we actually got
          (Spotify ID always confirms the link). No empty "—" placeholders. */}
      <div className="flex items-center justify-center" style={{ gap: 'var(--lp-space-4)', flexWrap: 'wrap' }}>
        {artist.followers != null ? <Stat label="Followers" value={artist.followers.toLocaleString()} /> : null}
        {artist.popularity != null ? <Stat label="Popularity" value={String(artist.popularity)} /> : null}
        <Stat label="Spotify ID" value={`${artist.id.slice(0, 10)}…`} />
      </div>

      <p style={{ margin: 0, fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)', maxWidth: 340 }}>
        Artwork and release history sync automatically — all changeable later.
      </p>

      <button
        type="button"
        onClick={onSearchAgain}
        className="btn-transition"
        style={{
          padding: 0,
          fontSize: 'var(--lp-text-sm)',
          fontWeight: 'var(--lp-weight-medium)',
          color: 'var(--color-lp-orange)',
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
        }}
      >
        Wrong artist? Search again →
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span className="lp-label-caps" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
        {label}
      </span>
      <span className="lp-mono" style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  );
}

/* ============================================================
   Step 3 · Details
   ============================================================ */

function DetailsStep({
  selected,
  displayName,
  onDisplayName,
  currency,
  onCurrency,
}: {
  selected: SpotifyArtist | null;
  displayName: string;
  onDisplayName: (v: string) => void;
  currency: string;
  onCurrency: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-4)' }}>
      {selected ? (
        <div className="flex items-center" style={{ gap: 'var(--lp-space-3)' }}>
          <Artwork url={selected.image_url} name={selected.name} size={44} radius={8} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--lp-text-base)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' }}>
              {selected.name}
            </div>
            <div className="lp-label-caps" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--color-lp-orange)' }}>
              Linked on Spotify
            </div>
          </div>
        </div>
      ) : null}

      <Field label="Display name">
        <input
          value={displayName}
          onChange={(e) => onDisplayName(e.target.value)}
          placeholder="Artist name"
          autoComplete="off"
          style={{
            width: '100%',
            height: 40,
            padding: '0 var(--lp-space-3)',
            background: 'var(--lp-surface)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            color: 'var(--lp-text)',
            fontSize: 'var(--lp-text-base)',
            outline: 'none',
          }}
        />
      </Field>

      <Field label="Default currency">
        <StyledSelect
          value={currency}
          onChange={onCurrency}
          options={TOUR_CURRENCIES.map((c) => ({ value: c.value, label: c.label }))}
        />
      </Field>

      <p style={{ margin: 0, fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>
        Everything here is optional — you can start a tour right away and fill this in later.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="lp-label-caps" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-secondary)' }}>
        {label}
      </span>
      {children}
    </label>
  );
}

/* ============================================================
   Shared bits
   ============================================================ */

function Artwork({ url, name, size, radius }: { url: string | null; name: string; size: number; radius: number }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote Spotify artwork; next/image domain config not wired for api.spotify.com
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0, background: 'var(--lp-surface-hover)' }}
      />
    );
  }
  const initials = name.trim().slice(0, 2).toUpperCase() || '?';
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--lp-surface-hover)',
        color: 'var(--lp-text-tertiary)',
        fontFamily: 'var(--lp-font-condensed)',
        fontSize: Math.round(size * 0.36),
        fontWeight: 700,
      }}
    >
      {initials}
    </div>
  );
}

function FooterButton({
  children,
  onClick,
  variant,
  disabled,
  icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant: 'primary' | 'ghost';
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  const primary = variant === 'primary';
  const enabled = !disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="btn-transition inline-flex items-center"
      style={{
        gap: 4,
        padding: 'var(--lp-space-2) var(--lp-space-4)',
        fontSize: 'var(--lp-text-sm)',
        fontWeight: primary ? 'var(--lp-weight-semibold)' : 'var(--lp-weight-medium)',
        color: primary
          ? enabled
            ? 'var(--lp-text-inverse)'
            : 'var(--lp-text-tertiary)'
          : 'var(--lp-text-secondary)',
        background: primary
          ? enabled
            ? 'var(--color-lp-orange)'
            : 'var(--lp-surface-hover)'
          : 'transparent',
        border: primary ? '1px solid transparent' : '1px solid var(--lp-border-strong)',
        borderRadius: 'var(--lp-radius-md)',
        cursor: enabled ? 'pointer' : 'not-allowed',
        opacity: primary && !enabled ? 0.7 : 1,
      }}
    >
      {icon}
      {children}
    </button>
  );
}
