/* ============================================
   LOWPASS — Sprint 8.4 §2 — <ArtistEditSlideOver>

   In-context edit flow for an existing artist. Replaces the
   legacy /artists/[id]/edit page navigation. Triggered by the
   "Edit profile" button in <ArtistHero> (now mounted via
   <EditArtistButton> client island).

   Field set per Sprint 8.4 §2 sign-off:
     - Name (required)
     - Spotify link (search/pick — same UX as ArtistCreateSlideOver,
       allows re-linking or unlinking)
     - Genre (text, free-form; lives in branding.genre JSONB)
     - Logo (<ArtistImageUploader kind="logo">)
     - Banner (<ArtistImageUploader kind="banner">)

   Image uploads happen in their own roundtrips via
   /api/artists/[id]/image/[kind] — the slide-over's Save only
   commits non-image fields (PATCH /api/artists/[id]). This means
   uploads persist immediately even before the user clicks Save,
   matching how the artist-create flow works.

   On Save: PATCH commits, slide-over closes, toast, parent
   router.refresh() to revalidate the page (so the hero reflects
   the new name / Spotify link / genre).
   ============================================ */

'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { Search, X as XIcon } from 'lucide-react';
import { SlideOver } from '@/components/shell/SlideOver';
import { useToast } from '@/components/ui/Toast';
import { ArtistImageUploader } from './ArtistImageUploader';

interface SpotifySearchResult {
  id: string;
  name: string;
  image_url: string | null;
  banner_url: string | null;
}

interface SelectedSpotify {
  id: string;
  name: string;
  image_url: string | null;
  banner_url: string | null;
}

export interface ArtistEditSlideOverArtist {
  id: string;
  name: string;
  spotify_id: string | null;
  spotify_image_url: string | null;
  spotify_banner_url: string | null;
  branding: {
    logo_url?: string | null;
    banner_url?: string | null;
    genre?: string | null;
  };
}

export interface ArtistEditSlideOverProps {
  open: boolean;
  onClose: () => void;
  artist: ArtistEditSlideOverArtist;
  /** Fired with the updated artist row after a successful PATCH.
   *  Wrapper components typically call router.refresh() here so
   *  the hero / landing card / switcher all see the new values. */
  onSaved?: (artist: ArtistEditSlideOverArtist) => void;
}

export function ArtistEditSlideOver({
  open,
  onClose,
  artist,
  onSaved,
}: ArtistEditSlideOverProps) {
  const formId = useId();
  const { showToast } = useToast();
  // Re-mount inner on `open` flip so per-open state resets to
  // the artist's current values (matches the create slide-over's
  // pattern from Sprint 8 §5).
  return (
    <ArtistEditSlideOverInner
      key={open ? `open-${artist.id}` : 'closed'}
      open={open}
      onClose={onClose}
      formId={formId}
      showToast={showToast}
      artist={artist}
      onSaved={onSaved}
    />
  );
}

interface InnerProps extends ArtistEditSlideOverProps {
  formId: string;
  showToast: ReturnType<typeof useToast>['showToast'];
}

function ArtistEditSlideOverInner({
  open,
  onClose,
  formId,
  showToast,
  artist,
  onSaved,
}: InnerProps) {
  /* -------- form state — initialised from the artist row -------- */
  const [name, setName] = useState(artist.name);
  const [genre, setGenre] = useState(artist.branding?.genre ?? '');
  const [logoUrl, setLogoUrl] = useState<string | null>(
    artist.branding?.logo_url ?? null,
  );
  const [bannerUrl, setBannerUrl] = useState<string | null>(
    artist.branding?.banner_url ?? null,
  );

  // Spotify-link state. Pre-populate from the artist row so the
  // user sees the existing link as a "linked" indicator.
  const [selected, setSelected] = useState<SelectedSpotify | null>(
    artist.spotify_id
      ? {
          id: artist.spotify_id,
          name: artist.name,
          image_url: artist.spotify_image_url,
          banner_url: artist.spotify_banner_url,
        }
      : null,
  );
  const [searchResults, setSearchResults] = useState<SpotifySearchResult[]>(
    [],
  );
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* -------- Spotify search debounce -------- */
  const runSearch = useCallback(async (q: string) => {
    try {
      const res = await fetch(
        `/api/spotify/search?q=${encodeURIComponent(q)}`,
      );
      if (!res.ok) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      const data = (await res.json()) as SpotifySearchResult[];
      setSearchResults(Array.isArray(data) ? data.slice(0, 5) : []);
      setSearching(false);
    } catch {
      setSearchResults([]);
      setSearching(false);
    }
  }, []);

  function onNameChange(next: string) {
    setName(next);
    // Editing while linked auto-unlinks (the user is overriding
    // the picked name; the Spotify link is no longer valid).
    if (selected && next !== selected.name) {
      setSelected(null);
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (next.trim().length < 2 || selected) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      void runSearch(next.trim());
    }, 300);
  }

  const onSelectSpotify = useCallback((r: SpotifySearchResult) => {
    setSelected({
      id: r.id,
      name: r.name,
      image_url: r.image_url,
      banner_url: r.banner_url,
    });
    setName(r.name);
    setSearchResults([]);
    setSearching(false);
  }, []);

  const clearSpotify = useCallback(() => {
    setSelected(null);
  }, []);

  // Cleanup debounce on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const trimmedName = name.trim();
  const canSubmit = !!trimmedName && !submitting;

  /* -------- submit -------- */
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      // Build branding payload — the PATCH route merges branding
      // shallow, but we send the full object to be explicit.
      // Image URLs (logo_url/banner_url) live in branding too,
      // and they were already written by the upload routes —
      // we send the local state to keep the row consistent.
      const branding: Record<string, unknown> = {};
      if (genre.trim()) branding.genre = genre.trim();
      if (logoUrl) branding.logo_url = logoUrl;
      if (bannerUrl) branding.banner_url = bannerUrl;

      // Spotify-link fields. When unlinked, send explicit nulls
      // so the PATCH route clears them. When linked but unchanged,
      // re-send the same values (idempotent).
      const payload: Record<string, unknown> = {
        name: trimmedName,
        branding,
        spotify_id: selected?.id ?? null,
        spotify_image_url: selected?.image_url ?? null,
        spotify_banner_url: selected?.banner_url ?? null,
      };

      const res = await fetch(`/api/artists/${artist.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as
        | (ArtistEditSlideOverArtist & { error?: string })
        | null;
      if (!res.ok) {
        setError(body?.error ?? `Save failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      showToast('Artist updated');
      if (body && body.id) {
        onSaved?.(body);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setSubmitting(false);
    }
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Edit artist"
      footer={
        <div
          className="flex items-center justify-end"
          style={{ gap: 'var(--lp-space-3)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="btn-transition"
            style={secondaryButton()}
          >
            Cancel
          </button>
          <button
            type="submit"
            form={formId}
            disabled={!canSubmit}
            className="btn-transition"
            style={primaryButton(canSubmit)}
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      }
    >
      <form
        id={formId}
        onSubmit={onSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--lp-space-4)',
        }}
      >
        {error ? (
          <div
            role="alert"
            style={{
              padding: 'var(--lp-space-3)',
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--color-lp-error)',
              background:
                'color-mix(in srgb, var(--color-lp-error) 10%, transparent)',
              border:
                '1px solid color-mix(in srgb, var(--color-lp-error) 30%, transparent)',
              borderRadius: 'var(--lp-radius-md)',
            }}
          >
            {error}
          </div>
        ) : null}

        {/* Name + Spotify search merged input */}
        <Field
          label="Artist name / Search Spotify"
          htmlFor={`${formId}-name`}
          required
        >
          <div style={{ position: 'relative' }}>
            <input
              id={`${formId}-name`}
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g. Good Neighbours"
              required
              autoComplete="off"
              style={{ ...inputStyle(), paddingRight: 36 }}
            />
            <Search
              aria-hidden
              size={16}
              strokeWidth={2}
              style={{
                position: 'absolute',
                right: 'var(--lp-space-3)',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--lp-text-tertiary)',
                pointerEvents: 'none',
              }}
            />
          </div>

          {selected ? (
            <div
              className="flex items-center"
              style={{
                gap: 'var(--lp-space-2)',
                padding: 'var(--lp-space-2) var(--lp-space-3)',
                fontSize: 'var(--lp-text-xs)',
                color: 'var(--lp-text-secondary)',
                background: 'var(--lp-panel)',
                border: '1px solid var(--lp-border-strong)',
                borderRadius: 'var(--lp-radius-sm)',
              }}
            >
              {selected.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.image_url}
                  alt=""
                  width={20}
                  height={20}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 'var(--lp-radius-full)',
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                />
              ) : null}
              <span style={{ color: 'var(--color-lp-orange)' }}>✓</span>
              <span className="min-w-0 flex-1 truncate">
                Linked to Spotify
              </span>
              <button
                type="button"
                onClick={clearSpotify}
                className="btn-transition inline-flex items-center"
                style={{
                  gap: 4,
                  padding: '2px 6px',
                  fontSize: 'var(--lp-text-xs)',
                  color: 'var(--lp-text-tertiary)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <XIcon size={12} strokeWidth={2} />
                Unlink
              </button>
            </div>
          ) : null}

          {!selected && searching && name.trim().length >= 2 ? (
            <div
              style={{
                fontSize: 'var(--lp-text-xs)',
                color: 'var(--lp-text-tertiary)',
              }}
            >
              Searching Spotify…
            </div>
          ) : null}

          {!selected &&
          !searching &&
          searchResults.length > 0 &&
          name.trim().length >= 2 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                background: 'var(--lp-panel)',
                border: '1px solid var(--lp-border-strong)',
                borderRadius: 'var(--lp-radius-md)',
                overflow: 'hidden',
              }}
            >
              {searchResults.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onSelectSpotify(r)}
                  className="btn-transition"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--lp-space-2)',
                    padding: 'var(--lp-space-2) var(--lp-space-3)',
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      'var(--lp-panel-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {r.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.image_url}
                      alt=""
                      width={32}
                      height={32}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 'var(--lp-radius-full)',
                        objectFit: 'cover',
                        flexShrink: 0,
                        background: 'var(--lp-bg-deep)',
                      }}
                    />
                  ) : (
                    <span
                      aria-hidden
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 'var(--lp-radius-full)',
                        background:
                          'color-mix(in srgb, var(--color-lp-orange) 25%, transparent)',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span
                    className="min-w-0 flex-1 truncate"
                    style={{
                      fontSize: 'var(--lp-text-sm)',
                      color: 'var(--lp-text)',
                    }}
                  >
                    {r.name}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </Field>

        <Field label="Genre" htmlFor={`${formId}-genre`}>
          <input
            id={`${formId}-genre`}
            type="text"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            placeholder="e.g. indie folk (optional)"
            style={inputStyle()}
          />
        </Field>

        <Field label="Logo" htmlFor={`${formId}-logo`}>
          <ArtistImageUploader
            artistId={artist.id}
            kind="logo"
            currentUrl={logoUrl}
            onChange={setLogoUrl}
            disabled={submitting}
          />
        </Field>

        <Field label="Banner" htmlFor={`${formId}-banner`}>
          <ArtistImageUploader
            artistId={artist.id}
            kind="banner"
            currentUrl={bannerUrl}
            onChange={setBannerUrl}
            disabled={submitting}
          />
        </Field>
      </form>
    </SlideOver>
  );
}

/* ----- shared field + input helpers (mirror create slide-over) ----- */

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--lp-space-1)',
      }}
    >
      <span
        className="lp-label-caps"
        style={{ color: 'var(--lp-text-secondary)' }}
      >
        {label}
        {required ? (
          <span
            aria-hidden
            style={{
              marginLeft: 'var(--lp-space-1)',
              color: 'var(--color-lp-orange)',
            }}
          >
            *
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: 'var(--lp-space-2) var(--lp-space-3)',
    fontSize: 'var(--lp-text-base)',
    color: 'var(--lp-text)',
    background: 'var(--lp-bg)',
    border: '1px solid var(--lp-border-strong)',
    borderRadius: 'var(--lp-radius-md)',
    outline: 'none',
  };
}

function primaryButton(enabled: boolean): React.CSSProperties {
  return {
    padding: 'var(--lp-space-2) var(--lp-space-4)',
    fontSize: 'var(--lp-text-sm)',
    fontWeight: 'var(--lp-weight-semibold)',
    color: enabled ? 'var(--lp-text-inverse)' : 'var(--lp-text-tertiary)',
    background: enabled
      ? 'var(--color-lp-orange)'
      : 'var(--lp-surface-hover)',
    border: '1px solid transparent',
    borderRadius: 'var(--lp-radius-md)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.7,
  };
}

function secondaryButton(): React.CSSProperties {
  return {
    padding: 'var(--lp-space-2) var(--lp-space-4)',
    fontSize: 'var(--lp-text-sm)',
    fontWeight: 'var(--lp-weight-medium)',
    color: 'var(--lp-text-secondary)',
    background: 'transparent',
    border: '1px solid var(--lp-border-strong)',
    borderRadius: 'var(--lp-radius-md)',
    cursor: 'pointer',
  };
}
