'use client';

/* ============================================
   LOWPASS — <ArtistTourPicker> — the top-bar artist & tour picker
   (Oct 2026 redesign — replaces shell-v2's ArtistTourSwitcher)

   Adam: "it vaguely works but closes between selections and doesn't reliably
   switch sometimes. It's also ugly." What the old one did wrong:

   1. Its tour list never loaded on most pages. The wrapper seeded its
      "already fetched" guard with the page's artist but was always handed
      `initialTours = null`, so on every artist and tour page the tours pane
      was empty until you picked a DIFFERENT artist and came back.
   2. Choosing an artist on an artist page NAVIGATED there. The page (and the
      picker inside it) remounted, so the panel closed/re-opened, and for the
      length of the load it still listed the OLD artist's tours — a click then
      opened the wrong tour.
   3. On a tour page, choosing an artist rewrote the URL with ?artist_id= while
      the path still named the old tour: "new artist · old tour".
   4. Choosing a tour from /budget (no tour yet) or a workspace page only set
      hidden state — nothing visibly happened.

   The model now:
   • ALL tours come with the page (ShellV3Mount loads them server-side in its
     existing fan-out) — no client fetch, no race, no empty pane.
   • Choosing an ARTIST only previews its tours in the right-hand column. It
     never navigates, so the panel never closes mid-choice.
   • Choosing a TOUR navigates once (pickerTourHref): the same page of the new
     tour when you're on one (Budget stays Budget, Crew stays Crew), else the
     tour's last-used product. The bar shows "Opening …" until it lands.
   • "Open artist page" is an explicit link. Deleting is NOT here (artist card
     ⋮ / artist-page tour row ⋮) — a destructive action in a fast nav menu is
     too easy to hit.
   • Phone: one full-height sheet; tap an artist to expand its tours.
   • Keyboard: type to search · ↑↓ move · ←→ artists/tours · ↵ open · esc.
   ============================================ */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Check, ChevronDown, Loader2, Plus, Search } from 'lucide-react';
import { ArtistInitialsChip } from '@/components/artists/ArtistInitialsChip';
import { ArtistCreateSlideOver } from '@/components/shell-v2/ArtistCreateSlideOver';
import { useTourEditor } from '@/contexts/TourEditorContext';
import { tourHref } from '@/lib/nav/lastProduct';
import {
  artistStatus,
  filterArtists,
  filterTours,
  groupTours,
  pickerTourHref,
  type PickerArtist,
  type PickerGroup,
  type PickerTour,
} from '@/lib/nav/pickerModel';

export interface ArtistTourPickerProps {
  artists: PickerArtist[];
  tours: PickerTour[];
  /** Server-known selection for THIS url (artist page / tour page). */
  currentArtistId: string | null;
  currentTourId: string | null;
  /** Tourless product landing (/budget, /operations, /advance). */
  landing?: boolean;
}

type Column = 'artists' | 'tours';

const GROUP_COLOUR: Record<PickerGroup['key'], string> = {
  road: 'var(--color-lp-status-complete)',
  upcoming: 'var(--color-lp-info)',
  tbc: 'var(--color-lp-status-needs-review)',
  past: 'var(--lp-text-tertiary)',
};

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return; // old browsers / jsdom: desktop layout
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

function Avatar({ artist, size }: { artist: PickerArtist | null; size: number }) {
  if (!artist) return null;
  if (artist.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={artist.imageUrl}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: 'var(--lp-radius-full)', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return <ArtistInitialsChip name={artist.name} size={size} />;
}

const caps = {
  fontSize: 'var(--lp-text-2xs)',
  fontWeight: 'var(--lp-weight-semibold)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
};

export function ArtistTourPicker({ artists, tours, currentArtistId, currentTourId, landing = false }: ArtistTourPickerProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const search = useSearchParams()?.toString() ?? '';
  const { openCreateTour } = useTourEditor();
  const narrow = useIsNarrow();
  const today = new Date().toISOString().slice(0, 10);

  const [open, setOpen] = useState(false);
  const [column, setColumn] = useState<Column>('tours');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showPast, setShowPast] = useState(false);
  const [active, setActive] = useState(0);
  const [createArtistOpen, setCreateArtistOpen] = useState(false);
  const [pendingTour, setPendingTour] = useState<{ artistId: string | null; name: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const toursByArtist = useMemo(() => {
    const m = new Map<string, PickerTour[]>();
    for (const t of tours) {
      if (!t.artistId) continue;
      const list = m.get(t.artistId) ?? [];
      list.push(t);
      m.set(t.artistId, list);
    }
    return m;
  }, [tours]);

  const currentTour = currentTourId ? tours.find((t) => t.id === currentTourId) ?? null : null;
  const currentArtistKey = currentArtistId ?? currentTour?.artistId ?? null;
  const currentArtist = currentArtistKey ? artists.find((a) => a.id === currentArtistKey) ?? null : null;

  const shownArtists = useMemo(() => filterArtists(artists, toursByArtist, query), [artists, toursByArtist, query]);
  const preview =
    shownArtists.find((a) => a.id === previewId) ??
    shownArtists.find((a) => a.id === currentArtistKey) ??
    shownArtists[0] ??
    null;
  const previewTours = preview ? filterTours(preview, toursByArtist.get(preview.id) ?? [], query) : [];
  const allGroups = groupTours(previewTours, today);
  const hasLive = allGroups.some((g) => g.key !== 'past');
  const pastOpen = showPast || !hasLive || !!query.trim();
  const groups = pastOpen ? allGroups : allGroups.filter((g) => g.key !== 'past');
  const pastCount = allGroups.find((g) => g.key === 'past')?.tours.length ?? 0;
  const flatTours = groups.flatMap((g) => g.tours);

  /* ---- open / close ---- */
  const openAt = useCallback(
    (col: Column) => {
      setColumn(col);
      setPreviewId(currentArtistKey);
      setQuery('');
      setShowPast(false);
      setActive(0);
      setOpen(true);
    },
    [currentArtistKey],
  );
  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  // Focus the search on open (desktop); click outside / Esc close.
  useEffect(() => {
    if (!open) return;
    if (!narrow) searchRef.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, narrow, close]);

  // Keep the keyboard highlight on the current artist / tour when it opens.
  useEffect(() => {
    if (!open) return;
    if (column === 'artists') {
      const i = shownArtists.findIndex((a) => a.id === preview?.id);
      setActive(Math.max(0, i));
    } else {
      const i = flatTours.findIndex((t) => t.id === currentTourId);
      setActive(Math.max(0, i));
    }
    // only on open / column switch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, column]);

  /* ---- actions ---- */
  const previewArtist = (id: string) => {
    setPreviewId(id);
    setShowPast(false);
    setColumn('tours');
    setActive(0);
  };

  const pickTour = (t: PickerTour) => {
    const href = pickerTourHref(pathname, search ? `?${search}` : '', t.id, tourHref(t.id));
    close(false);
    if (t.id === currentTourId && pathname.includes(t.id)) return; // already here
    setPendingTour({ artistId: t.artistId, name: t.name });
    startTransition(() => router.push(href));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    const list = column === 'artists' ? shownArtists.length : flatTours.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (list ? (i + 1) % list : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (list ? (i - 1 + list) % list : 0));
    } else if (e.key === 'ArrowRight' && column === 'artists') {
      e.preventDefault();
      const a = shownArtists[active];
      if (a) previewArtist(a.id);
    } else if (e.key === 'ArrowLeft' && column === 'tours') {
      e.preventDefault();
      setColumn('artists');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (column === 'artists') {
        const a = shownArtists[active];
        if (a) previewArtist(a.id);
      } else {
        const t = flatTours[active];
        if (t) pickTour(t);
      }
    }
  };

  /* ---- trigger ---- */
  const pendingArtist = pendingTour?.artistId ? artists.find((a) => a.id === pendingTour.artistId) ?? null : null;
  const showPending = isPending && !!pendingTour;
  const trigArtist = showPending ? pendingArtist ?? currentArtist : currentArtist;
  const trigTourName = showPending ? null : currentTour?.name ?? null;
  const tourPhaseColour = currentTour
    ? GROUP_COLOUR[groupTours([currentTour], today)[0]?.key ?? 'past']
    : null;

  const segBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--lp-space-2)',
    height: 32,
    border: 0,
    background: 'transparent',
    fontSize: 'var(--lp-text-sm)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    minWidth: 0,
  };

  const trigger = !currentArtist && !showPending ? (
    <button
      ref={triggerRef}
      type="button"
      data-testid="picker-trigger"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => (open ? close() : openAt('artists'))}
      className="btn-transition"
      style={{
        ...segBase,
        height: 34,
        padding: '0 var(--lp-space-3) 0 var(--lp-space-2)',
        border: `1px ${landing ? 'dashed' : 'solid'} var(--lp-border-strong)`,
        borderRadius: 'var(--lp-radius-lg)',
        color: 'var(--lp-text-secondary)',
      }}
    >
      <Plus size={14} aria-hidden />
      {landing ? 'Choose an artist and tour' : 'Choose an artist'}
      <ChevronDown size={12} aria-hidden style={{ color: 'var(--lp-text-tertiary)' }} />
    </button>
  ) : narrow ? (
    <button
      ref={triggerRef}
      type="button"
      data-testid="picker-trigger"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`Switch artist or tour — ${trigArtist?.name ?? ''}${trigTourName ? `, ${trigTourName}` : ''}`}
      onClick={() => (open ? close() : openAt('tours'))}
      style={{
        ...segBase,
        height: 40,
        maxWidth: '58vw',
        padding: '0 var(--lp-space-2) 0 6px',
        border: '1px solid var(--lp-border-strong)',
        borderRadius: 'var(--lp-radius-lg)',
        background: 'var(--lp-surface)',
        color: 'var(--lp-text)',
      }}
    >
      <Avatar artist={trigArtist} size={26} />
      <span className="truncate">{showPending ? `Opening ${pendingTour!.name}…` : trigTourName ?? trigArtist?.name}</span>
      {showPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ChevronDown size={12} aria-hidden style={{ color: 'var(--lp-text-tertiary)', flexShrink: 0 }} />}
    </button>
  ) : (
    <div
      data-testid="picker-trigger-group"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minWidth: 0,
        height: 34,
        border: '1px solid var(--lp-border-strong)',
        borderRadius: 'var(--lp-radius-lg)',
        background: open ? 'var(--lp-panel-hover)' : 'var(--lp-surface)',
        boxShadow: open ? '0 0 0 3px color-mix(in srgb, var(--lp-orange) 18%, transparent)' : undefined,
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        data-testid="picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={open && column === 'artists'}
        aria-label={`Artist: ${trigArtist?.name ?? ''} — switch artist`}
        onClick={() => (open && column === 'artists' ? close() : openAt('artists'))}
        className="lp-picker-seg"
        style={{ ...segBase, padding: '0 var(--lp-space-3) 0 5px', color: 'var(--lp-text)', fontWeight: 'var(--lp-weight-medium)', borderRadius: 'var(--lp-radius-lg) 0 0 var(--lp-radius-lg)' }}
      >
        <Avatar artist={trigArtist} size={22} />
        <span className="truncate" style={{ maxWidth: 200 }}>{trigArtist?.name}</span>
      </button>
      <span aria-hidden style={{ width: 1, height: 18, background: 'var(--lp-border-strong)', flexShrink: 0 }} />
      <button
        type="button"
        data-testid="picker-trigger-tour"
        aria-haspopup="dialog"
        aria-expanded={open && column === 'tours'}
        aria-label={trigTourName ? `Tour: ${trigTourName} — switch tour` : 'Choose a tour'}
        onClick={() => (open && column === 'tours' ? close() : openAt('tours'))}
        className="lp-picker-seg"
        style={{ ...segBase, padding: '0 var(--lp-space-3)', color: trigTourName ? 'var(--lp-text-secondary)' : 'var(--lp-text-tertiary)', borderRadius: '0 var(--lp-radius-lg) var(--lp-radius-lg) 0' }}
      >
        {showPending ? (
          <>
            <Loader2 size={13} className="animate-spin" aria-hidden style={{ color: 'var(--lp-orange)' }} />
            <span className="truncate" style={{ maxWidth: 260 }}>Opening {pendingTour!.name}…</span>
          </>
        ) : (
          <>
            {tourPhaseColour ? (
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: 'var(--lp-radius-full)', background: tourPhaseColour, flexShrink: 0 }} />
            ) : null}
            <span className="truncate" style={{ maxWidth: 280 }}>{trigTourName ?? 'Choose a tour'}</span>
            <ChevronDown size={12} aria-hidden style={{ color: 'var(--lp-text-tertiary)', flexShrink: 0 }} />
          </>
        )}
      </button>
    </div>
  );

  /* ---- shared pieces ---- */
  const rowBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--lp-space-3)',
    width: '100%',
    border: 0,
    borderRadius: 'var(--lp-radius-lg)',
    cursor: 'pointer',
    textAlign: 'left',
    color: 'var(--lp-text)',
  };

  const tourRow = (t: (typeof flatTours)[number], i: number, key: PickerGroup['key']) => {
    const here = t.id === currentTourId;
    const hot = column === 'tours' && i === active;
    return (
      <button
        key={t.id}
        type="button"
        data-testid="picker-tour"
        onClick={() => pickTour(t)}
        onMouseEnter={() => {
          setColumn('tours');
          setActive(i);
        }}
        aria-current={here ? 'page' : undefined}
        style={{
          ...rowBase,
          padding: narrow ? '10px' : '9px 10px',
          minHeight: narrow ? 52 : undefined,
          background: hot ? 'var(--lp-panel-hover)' : here ? 'color-mix(in srgb, var(--lp-orange) 7%, transparent)' : 'transparent',
        }}
      >
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 'var(--lp-radius-full)', background: GROUP_COLOUR[key], flexShrink: 0 }} />
        <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 2 }}>
          <span className="truncate" style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-medium)' }}>{t.name}</span>
          <span className="truncate tabular-nums" style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>{t.detail}</span>
        </span>
        {here ? (
          <span
            style={{
              flexShrink: 0,
              fontSize: 'var(--lp-text-2xs)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-orange)',
              background: 'color-mix(in srgb, var(--lp-orange) 12%, transparent)',
              borderRadius: 'var(--lp-radius-full)',
              padding: '3px 8px',
            }}
          >
            You&apos;re here
          </span>
        ) : null}
      </button>
    );
  };

  const toursBody = (artist: PickerArtist) => {
    let i = -1;
    return (
      <>
        {groups.map((g) => (
          <div key={g.key} role="group" aria-label={g.label}>
            <div style={{ ...caps, color: GROUP_COLOUR[g.key], padding: '10px 10px 4px' }}>{g.label}</div>
            {g.tours.map((t) => {
              i += 1;
              return tourRow(t, i, g.key);
            })}
          </div>
        ))}
        {pastCount > 0 && hasLive && !query.trim() ? (
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            style={{ border: 0, background: 'transparent', color: 'var(--lp-text-secondary)', fontSize: 'var(--lp-text-xs)', padding: '8px 10px', cursor: 'pointer', textAlign: 'left' }}
          >
            {pastOpen ? 'Hide past tours' : `Show ${pastCount} past tour${pastCount === 1 ? '' : 's'}`}
          </button>
        ) : null}
        {previewTours.length === 0 ? (
          <div style={{ padding: '24px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>{query.trim() ? 'No matching tours' : 'No tours yet'}</span>
            {!query.trim() ? (
              <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>
                Create one to open Operations, Budget and Advance for {artist.name}.
              </span>
            ) : null}
          </div>
        ) : null}
      </>
    );
  };

  const newTourButton = (artist: PickerArtist) => (
    <button
      type="button"
      onClick={() => {
        close(false);
        openCreateTour({ artistId: artist.id });
      }}
      style={{ ...rowBase, padding: '8px 10px', minHeight: narrow ? 44 : undefined, color: 'var(--lp-orange)', fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)', background: 'transparent' }}
    >
      <Plus size={14} aria-hidden /> New tour for {artist.name}
    </button>
  );

  const footerLinks = (
    <>
      <button
        type="button"
        onClick={() => {
          close(false);
          setCreateArtistOpen(true);
        }}
        style={{ border: 0, background: 'transparent', color: 'var(--lp-text-secondary)', fontSize: 'var(--lp-text-xs)', cursor: 'pointer', padding: narrow ? '12px 0' : 0 }}
      >
        + New artist
      </button>
      <Link
        href="/artists"
        onClick={() => close(false)}
        style={{ color: 'var(--lp-text-secondary)', fontSize: 'var(--lp-text-xs)', textDecoration: 'none', padding: narrow ? '12px 0' : 0 }}
      >
        All artists
      </Link>
    </>
  );

  const searchBox = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--lp-space-2)',
        padding: narrow ? '0 12px' : '10px 14px',
        margin: narrow ? '0 16px 8px' : 0,
        height: narrow ? 44 : undefined,
        border: narrow ? '1px solid var(--lp-border)' : 0,
        borderBottom: narrow ? undefined : '1px solid var(--lp-border-subtle)',
        borderRadius: narrow ? 'var(--lp-radius-lg)' : 0,
        background: narrow ? 'var(--lp-surface)' : 'transparent',
      }}
    >
      <Search size={16} aria-hidden style={{ color: 'var(--lp-text-tertiary)', flexShrink: 0 }} />
      <input
        ref={searchRef}
        type="text"
        aria-label="Search artists and tours"
        placeholder="Search artists and tours"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        style={{
          flex: 1,
          minWidth: 0,
          height: 28,
          border: 0,
          outline: 'none',
          background: 'transparent',
          color: 'var(--lp-text)',
          // 16px on phones stops iOS zooming into the field
          fontSize: narrow ? 16 : 'var(--lp-text-sm)',
        }}
      />
      {!narrow ? (
        <kbd style={{ fontFamily: 'inherit', fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)', border: '1px solid var(--lp-border-strong)', borderRadius: 'var(--lp-radius-md)', padding: '1px 6px' }}>esc</kbd>
      ) : null}
    </div>
  );

  /* ---- desktop panel ---- */
  const desktopPanel = (
    <div
      role="dialog"
      aria-label="Switch artist or tour"
      data-testid="picker-panel"
      onKeyDown={onKeyDown}
      className="lp-picker-panel"
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        left: 0,
        zIndex: 'var(--lp-z-dropdown)' as unknown as number,
        width: 'min(700px, calc(100vw - 24px))',
        background: 'var(--lp-panel)',
        border: '1px solid var(--lp-border-strong)',
        borderRadius: 'var(--lp-radius-lg)',
        boxShadow: 'var(--lp-shadow-popover)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {searchBox}
      <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0, 1fr)', height: 400 }}>
        {/* Artists */}
        <div style={{ borderRight: '1px solid var(--lp-border-subtle)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ ...caps, color: 'var(--lp-text-tertiary)', padding: '12px 14px 6px' }}>Artists</div>
          <div role="listbox" aria-label="Artists" style={{ flex: 1, overflowY: 'auto', padding: '0 6px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {shownArtists.map((a, i) => {
              const s = artistStatus(toursByArtist.get(a.id) ?? [], today);
              const selected = a.id === preview?.id;
              const hot = column === 'artists' && i === active;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-testid="picker-artist"
                  onClick={() => previewArtist(a.id)}
                  onMouseEnter={() => {
                    setColumn('artists');
                    setActive(i);
                  }}
                  style={{
                    ...rowBase,
                    gap: 10,
                    padding: '7px 8px',
                    background: selected ? 'var(--lp-panel-hover)' : hot ? 'color-mix(in srgb, var(--lp-panel-hover) 60%, transparent)' : 'transparent',
                  }}
                >
                  <Avatar artist={a} size={30} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate" style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-medium)' }}>{a.name}</span>
                    <span className="truncate" style={{ fontSize: 'var(--lp-text-xs)', color: s.live ? 'var(--color-lp-status-complete)' : 'var(--lp-text-tertiary)' }}>{s.text}</span>
                  </span>
                  {a.id === currentArtistKey ? <Check size={14} aria-label="You're here" style={{ color: 'var(--lp-orange)', flexShrink: 0 }} /> : null}
                </button>
              );
            })}
            {shownArtists.length === 0 ? (
              <div style={{ padding: 10, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)' }}>
                No artist or tour matches “{query}”.
              </div>
            ) : null}
          </div>
        </div>

        {/* Tours of the previewed artist */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {preview ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '12px 16px 4px' }}>
                <span className="truncate" style={{ ...caps, color: 'var(--lp-text-tertiary)' }}>{preview.name} · tours</span>
                <Link
                  href={`/artists/${preview.id}`}
                  onClick={() => close(false)}
                  style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                >
                  Open artist page →
                </Link>
              </div>
              <div role="listbox" aria-label={`${preview.name} tours`} style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
                {toursBody(preview)}
              </div>
              <div style={{ borderTop: '1px solid var(--lp-border-subtle)', padding: 6 }}>{newTourButton(preview)}</div>
            </>
          ) : null}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--lp-space-4)',
          padding: '8px 14px',
          borderTop: '1px solid var(--lp-border-subtle)',
          background: 'var(--lp-bg-deep)',
        }}
      >
        {footerLinks}
        <span style={{ marginLeft: 'auto', fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)', whiteSpace: 'nowrap' }}>
          ↑↓ move · ←→ artists / tours · ↵ open · esc close
        </span>
      </div>
    </div>
  );

  /* ---- phone sheet ---- */
  const phoneSheet = (
    <div role="dialog" aria-modal="true" aria-label="Switch artist or tour" data-testid="picker-sheet" onKeyDown={onKeyDown}>
      <div
        aria-hidden
        onClick={() => close(false)}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 'var(--lp-z-modal-backdrop)' as unknown as number }}
      />
      <div
        className="lp-picker-sheet"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          top: 56,
          zIndex: 'var(--lp-z-modal)' as unknown as number,
          background: 'var(--lp-panel)',
          borderTop: '1px solid var(--lp-border-strong)',
          borderRadius: '16px 16px 0 0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div aria-hidden style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 4, background: 'var(--lp-border-strong)', margin: '8px 0 4px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 16px 8px' }}>
          <span style={{ fontSize: 'var(--lp-text-md)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' }}>Switch tour</span>
          <button type="button" onClick={() => close()} style={{ minHeight: 44, border: 0, background: 'transparent', color: 'var(--lp-text-secondary)', fontSize: 'var(--lp-text-sm)', cursor: 'pointer' }}>
            Done
          </button>
        </div>
        {searchBox}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 12px' }}>
          {shownArtists.map((a) => {
            const s = artistStatus(toursByArtist.get(a.id) ?? [], today);
            const expanded = a.id === preview?.id && previewId !== '__none__';
            return (
              <div key={a.id}>
                <button
                  type="button"
                  data-testid="picker-artist"
                  aria-expanded={expanded}
                  onClick={() => (expanded ? setPreviewId('__none__') : previewArtist(a.id))}
                  style={{ ...rowBase, minHeight: 56, padding: 8, background: expanded ? 'var(--lp-panel-hover)' : 'transparent' }}
                >
                  <Avatar artist={a} size={36} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate" style={{ fontSize: 15, fontWeight: 'var(--lp-weight-medium)' }}>{a.name}</span>
                    <span className="truncate" style={{ fontSize: 13, color: s.live ? 'var(--color-lp-status-complete)' : 'var(--lp-text-tertiary)' }}>{s.text}</span>
                  </span>
                  <ChevronDown size={16} aria-hidden style={{ color: 'var(--lp-text-tertiary)', transform: expanded ? 'rotate(180deg)' : undefined, flexShrink: 0 }} />
                </button>
                {expanded ? (
                  <div style={{ margin: '0 0 8px 44px' }}>
                    {toursBody(a)}
                    {newTourButton(a)}
                    <Link
                      href={`/artists/${a.id}`}
                      onClick={() => close(false)}
                      style={{ display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 10px', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)', textDecoration: 'none' }}
                    >
                      Open artist page →
                    </Link>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 'var(--lp-space-5)', padding: '4px 16px 20px', borderTop: '1px solid var(--lp-border-subtle)' }}>{footerLinks}</div>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} style={{ position: 'relative', minWidth: 0 }} data-component="ArtistTourPicker">
      {trigger}
      {open ? (narrow ? phoneSheet : desktopPanel) : null}
      <ArtistCreateSlideOver
        open={createArtistOpen}
        onClose={() => setCreateArtistOpen(false)}
        onCreated={(a) => {
          setCreateArtistOpen(false);
          router.push(`/artists/${a.id}`);
          router.refresh();
        }}
      />
    </div>
  );
}
