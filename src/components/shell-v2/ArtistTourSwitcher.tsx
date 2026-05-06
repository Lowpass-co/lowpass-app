/* ============================================
   LOWPASS — Sprint 5 §1 — <ArtistTourSwitcher>

   Combined hierarchical artist→tour dropdown that replaces the
   static `[Artist] › [Tour]` chips in <ProductHeader>. Trigger
   shows current selection; dropdown panel switches between an
   artists state and a tours-grouped-by-year state.

   Selection state (selectedArtistId / selectedTourId) lives in
   ArtistTourContext — the switcher reads from it and writes via
   the context's setters. The setters already handle URL +
   localStorage sync (Sprint 4 path-aware hydration). This
   component owns:

     - dropdown open/close state machine
     - artists ↔ tours pane transition
     - artist-image fallback (logo_url → spotify_image_url → initials)
     - year grouping for tours
     - "+ Create new tour" CTA wiring (callback only — slide-over
       in Phase 3)

   Animations live in globals.css under the .lp-ats-* prefix so
   prefers-reduced-motion can override them via @media. CSS class
   only — no inline animation values.
   ============================================ */

'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Plus,
  User,
} from 'lucide-react';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';

/** Minimum artist shape the switcher needs. Wider than this is
 *  fine — extra fields are ignored. `branding` is unknown because
 *  we narrow inside `pickArtistImage`. */
type ArtistMin = {
  id: string;
  name: string;
  branding: unknown;
  spotify_image_url?: string | null;
};

type TourMin = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
};

interface ArtistTourSwitcherProps {
  /** Pre-fetched artist list — server-side initial data so the
   *  dropdown is instant on first open. The context's own artists
   *  list takes over once it loads. */
  initialArtists: ArtistMin[];
  /** Tours for the currently-selected artist (Sprint 6 §2: owned
   *  by the wrapper now). Updates immediately on artist change
   *  to clear the previous artist's stale entries, and again
   *  optimistically when a new tour is created via the slide-over. */
  tours: TourMin[];
  /** True while the wrapper is fetching tours for a newly-selected
   *  artist. The tours pane shows a loading state instead of an
   *  empty list. */
  toursLoading: boolean;
  /** Called when the user clicks "+ Create new tour" — wired to
   *  the slide-over by the wrapper. */
  onCreateTour: () => void;
}

/** Sprint 6 §1 — 'opening' is the one-frame mount state where the
 *  panel renders without data-state so the base CSS (opacity 0,
 *  translateY(-4px)) paints. The next requestAnimationFrame flips
 *  to 'open', giving the CSS transition a real "before" frame to
 *  interpolate from. Without this intermediate state the panel
 *  mounts with data-state='open' already set and the transition
 *  never fires (visible as a flash on open). */
type DropdownState = 'closed' | 'opening' | 'open' | 'closing';
type Pane = 'artists' | 'tours';
type PaneAnim =
  | 'idle'
  | 'enter-from-right'
  | 'enter-from-left'
  | 'exit-to-left'
  | 'exit-to-right';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function parseDateUTC(iso: string): Date | null {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatSingleDate(iso: string): string | null {
  const d = parseDateUTC(iso);
  if (!d) return null;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Jan – Mar 2026" / "12 Apr 2026" / "Sep 2025 – Feb 2026" / null. */
function formatTourDateRange(
  start: string | null,
  end: string | null,
): string | null {
  if (!start && !end) return null;
  if (start && !end) return formatSingleDate(start);
  if (!start && end) return formatSingleDate(end);
  if (start === end) return formatSingleDate(start!);
  const s = parseDateUTC(start!);
  const e = parseDateUTC(end!);
  if (!s || !e) return null;
  if (s.getUTCFullYear() === e.getUTCFullYear()) {
    return `${MONTHS[s.getUTCMonth()]} – ${MONTHS[e.getUTCMonth()]} ${s.getUTCFullYear()}`;
  }
  return `${MONTHS[s.getUTCMonth()]} ${s.getUTCFullYear()} – ${MONTHS[e.getUTCMonth()]} ${e.getUTCFullYear()}`;
}

/** Inline equivalent of the (non-existent) pickArtistImageUrl helper.
 *  Prefer branding.logo_url, fall back to spotify_image_url, else null. */
function pickArtistImage(artist: ArtistMin): string | null {
  const branding = (artist.branding ?? null) as
    | { logo_url?: string | null; banner_url?: string | null }
    | null;
  if (branding?.logo_url) return branding.logo_url;
  if (artist.spotify_image_url) return artist.spotify_image_url;
  return null;
}

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  return parts.map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

interface YearGroup {
  /** null = no start_date — UNDATED bucket. */
  year: number | null;
  tours: TourMin[];
}

function groupToursByYear(tours: TourMin[]): YearGroup[] {
  const map = new Map<number | null, TourMin[]>();
  for (const t of tours) {
    const d = t.start_date ? parseDateUTC(t.start_date) : null;
    const year = d?.getUTCFullYear() ?? null;
    const list = map.get(year) ?? [];
    list.push(t);
    map.set(year, list);
  }
  // Sort: years desc, null (undated) last.
  const entries = Array.from(map.entries()).sort((a, b) => {
    if (a[0] === null) return 1;
    if (b[0] === null) return -1;
    return (b[0] as number) - (a[0] as number);
  });
  // Sprint 6 §2 sub-bug D — sort tours within each year by
  // start_date desc (most-recent first). Use a parsed timestamp
  // rather than localeCompare on the raw string so any DATE/
  // ISO-with-time mix in the column doesn't fall through to
  // an alphabetical compare. Nulls sink to the bottom of the
  // year (rare, since tours without a start_date go to the
  // 'undated' bucket — but defensive).
  for (const [, list] of entries) {
    list.sort((a, b) => {
      const aMs = a.start_date ? parseDateUTC(a.start_date)?.getTime() ?? null : null;
      const bMs = b.start_date ? parseDateUTC(b.start_date)?.getTime() ?? null : null;
      if (aMs === null && bMs === null) return 0;
      if (aMs === null) return 1;
      if (bMs === null) return -1;
      return bMs - aMs;
    });
  }
  return entries.map(([year, list]) => ({ year, tours: list }));
}

export function ArtistTourSwitcher({
  initialArtists,
  tours,
  toursLoading,
  onCreateTour,
}: ArtistTourSwitcherProps) {
  const {
    selectedArtistId,
    selectedTourId,
    selectedArtist,
    selectedTour,
    setSelectedArtistId,
    setSelectedTourId,
    artists: ctxArtists,
  } = useArtistTourContext();
  const router = useRouter();
  const pathname = usePathname();

  // Live artist list: prefer context once it has loaded; fall back
  // to server-prefetched list. Tours come from props now (Sprint 6
  // §2 — wrapper owns them).
  const artists: ArtistMin[] = useMemo(
    () =>
      ctxArtists.length > 0
        ? ctxArtists.map((a) => ({
            id: a.id,
            name: a.name,
            branding: a.branding,
            spotify_image_url: a.spotify_image_url ?? null,
          }))
        : initialArtists,
    [ctxArtists, initialArtists],
  );

  // Selected-display fallbacks: if the context hasn't loaded the
  // selected artist/tour yet, look them up in the prefetched lists
  // so the trigger button never flashes "Pick an artist…" between
  // renders.
  const displayArtistName =
    selectedArtist?.name ??
    artists.find((a) => a.id === selectedArtistId)?.name ??
    null;
  const displayTourName =
    selectedTour?.name ??
    tours.find((t) => t.id === selectedTourId)?.name ??
    null;

  /* -------- dropdown state machine -------- */
  const [dropdownState, setDropdownState] =
    useState<DropdownState>('closed');
  const [pane, setPane] = useState<Pane>('artists');
  // The pane currently animating OUT (rendered alongside the new
  // pane during the 250ms cross-fade). null when no transition.
  const [exitingPane, setExitingPane] = useState<Pane | null>(null);
  // Direction of the in-flight pane transition. Determines which
  // CSS data-pane-state value each pane uses.
  const [paneDirection, setPaneDirection] =
    useState<'forward' | 'back'>('forward');

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openRafRef = useRef<number | null>(null);

  const open =
    dropdownState === 'opening' ||
    dropdownState === 'open' ||
    dropdownState === 'closing';

  const initialPaneOnOpen: Pane = selectedArtistId ? 'tours' : 'artists';

  const openDropdown = useCallback(() => {
    // Two-frame raf pattern (Sprint 6 §1): mount the panel first
    // with no data-state so the CSS base styles (opacity 0,
    // translateY(-4px)) paint. Then on the next frame flip to
    // 'open' — the transition fires from the painted base state
    // to the open state. Without this intermediate frame the
    // panel mounts with data-state='open' already set and no
    // transition runs (the "open is a flash" smoke from Adam's
    // Sprint 5 SR).
    setPane(initialPaneOnOpen);
    setExitingPane(null);
    setDropdownState('opening');
    if (openRafRef.current !== null) {
      cancelAnimationFrame(openRafRef.current);
    }
    openRafRef.current = requestAnimationFrame(() => {
      openRafRef.current = null;
      setDropdownState((prev) => (prev === 'opening' ? 'open' : prev));
    });
  }, [initialPaneOnOpen]);

  const closeDropdown = useCallback(() => {
    if (openRafRef.current !== null) {
      cancelAnimationFrame(openRafRef.current);
      openRafRef.current = null;
    }
    setDropdownState((prev) => {
      // If still 'opening' (raf hasn't fired), unmount immediately
      // — there's no painted 'open' state to transition out of.
      if (prev === 'opening') return 'closed';
      return prev === 'open' ? 'closing' : prev;
    });
  }, []);

  // Unmount the panel when the close transition completes.
  const handlePanelTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLDivElement>) => {
      if (e.target !== panelRef.current) return;
      if (e.propertyName !== 'opacity') return;
      if (dropdownState === 'closing') {
        setDropdownState('closed');
      }
    },
    [dropdownState],
  );

  // Cancel any pending raf on unmount.
  useEffect(() => {
    return () => {
      if (openRafRef.current !== null) {
        cancelAnimationFrame(openRafRef.current);
        openRafRef.current = null;
      }
    };
  }, []);

  /* -------- Esc + click-outside -------- */
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDropdown();
      }
    }
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      // Click-inside the panel or trigger → ignore. Anywhere else → close.
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      closeDropdown();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, closeDropdown]);

  /* -------- pane transitions -------- */
  const transitionToPane = useCallback(
    (next: Pane, direction: 'forward' | 'back') => {
      setPane((current) => {
        if (current === next) return current;
        setExitingPane(current);
        setPaneDirection(direction);
        return next;
      });
    },
    [],
  );

  // After the exiting pane's transition completes, drop it from
  // the DOM. Sprint 6 §1: switched from animationend (keyframes)
  // to transitionend (CSS transitions). The exiting pane signals
  // via its data-pane-state — we listen for the 'opacity' end on
  // either pane and check the data-pane-state to identify which
  // one finished.
  const handlePaneTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLDivElement>) => {
      if (e.propertyName !== 'opacity') return;
      const target = e.currentTarget;
      const state = target.getAttribute('data-pane-state');
      if (state === 'exit-to-left' || state === 'exit-to-right') {
        setExitingPane(null);
      }
    },
    [],
  );

  /* -------- list interaction -------- */
  const handleArtistClick = useCallback(
    (id: string) => {
      // setSelectedArtistId clears the tour selection (context
      // contract — switching artist invalidates the tour).
      setSelectedArtistId(id);
      transitionToPane('tours', 'forward');
    },
    [setSelectedArtistId, transitionToPane],
  );

  const handleTourClick = useCallback(
    (id: string) => {
      // Sprint 6 §2 sub-bug A — setSelectedTourId only writes URL
      // params + localStorage; on tour-prefixed routes the path
      // segment still encodes the OLD tour id, so the page renders
      // the old tour. Push to the tour-scoped URL for the active
      // product so the page actually navigates.
      setSelectedTourId(id);
      closeDropdown();
      const productMatch = pathname?.match(
        /^\/(budget|advance|operations)\//,
      );
      if (productMatch) {
        router.push(`/${productMatch[1]}/${id}`);
      }
      // Non-product paths (/artists/[id], /personnel, etc.) stay
      // put — context update is enough.
    },
    [setSelectedTourId, closeDropdown, pathname, router],
  );

  const handleBackToArtists = useCallback(() => {
    transitionToPane('artists', 'back');
  }, [transitionToPane]);

  /* -------- derived render data -------- */
  const yearGroups = useMemo(() => groupToursByYear(tours), [tours]);
  const triggerArtist = useMemo(
    () => artists.find((a) => a.id === selectedArtistId) ?? null,
    [artists, selectedArtistId],
  );
  const dropdownArtistName =
    triggerArtist?.name ?? displayArtistName ?? 'Artist';

  const triggerEmpty = !displayArtistName;
  const tourEmpty = !!displayArtistName && !displayTourName;

  /* -------- render -------- */
  return (
    <div
      style={{ position: 'relative' }}
      data-component="ArtistTourSwitcher"
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closeDropdown() : openDropdown())}
        aria-haspopup="menu"
        aria-expanded={open}
        data-active={open || undefined}
        className="lp-ats-trigger btn-transition flex min-w-0 items-center"
        style={{
          gap: 'var(--lp-space-2)',
          padding: 'var(--lp-space-2) var(--lp-space-3)',
          height: 36,
          maxWidth: 380,
          fontSize: 'var(--lp-text-base)',
          fontWeight: 'var(--lp-weight-medium)',
          color: triggerEmpty
            ? 'var(--lp-text-secondary)'
            : 'var(--lp-text)',
          background: open ? 'var(--lp-panel-hover)' : 'var(--lp-panel)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 'var(--lp-radius-md)',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--lp-panel-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = open
            ? 'var(--lp-panel-hover)'
            : 'var(--lp-panel)';
        }}
      >
        {/* Leading avatar — artist image / initials chip / generic User
            icon for the no-artist empty state. Sized 24px to match
            the artists-pane row avatar so the trigger visually echoes
            the dropdown content. */}
        {triggerArtist ? (
          <ArtistAvatar
            imageUrl={pickArtistImage(triggerArtist)}
            name={triggerArtist.name}
          />
        ) : (
          <span
            aria-hidden
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: 'var(--lp-radius-full)',
              background: 'var(--lp-bg-deep)',
              border: '1px dashed var(--lp-border-strong)',
              color: 'var(--lp-text-tertiary)',
              flexShrink: 0,
            }}
          >
            <User size={14} strokeWidth={2} />
          </span>
        )}

        {/* Label group — fills remaining horizontal space, truncates
            the tour name first since artist names are usually shorter. */}
        <span
          className="min-w-0 flex-1 truncate"
          style={{ textAlign: 'left' }}
        >
          {triggerEmpty ? (
            'Pick an artist…'
          ) : tourEmpty ? (
            <>
              <span
                style={{
                  color: 'var(--lp-text)',
                  fontWeight: 'var(--lp-weight-medium)',
                }}
              >
                {displayArtistName}
              </span>
              <span
                aria-hidden
                style={{
                  margin: '0 var(--lp-space-2)',
                  color: 'var(--lp-text-tertiary)',
                }}
              >
                ·
              </span>
              <span
                style={{
                  color: 'var(--lp-text-tertiary)',
                  fontWeight: 'var(--lp-weight-regular)',
                }}
              >
                Pick a tour…
              </span>
            </>
          ) : (
            <>
              <span
                style={{
                  color: 'var(--lp-text)',
                  fontWeight: 'var(--lp-weight-medium)',
                }}
              >
                {displayArtistName}
              </span>
              <span
                aria-hidden
                style={{
                  margin: '0 var(--lp-space-2)',
                  color: 'var(--lp-text-tertiary)',
                }}
              >
                ·
              </span>
              <span
                style={{
                  color: 'var(--lp-text-secondary)',
                  fontWeight: 'var(--lp-weight-regular)',
                }}
              >
                {displayTourName}
              </span>
            </>
          )}
        </span>

        {/* Trailing chevron — flips up when open. */}
        {open ? (
          <ChevronUp
            aria-hidden
            size={12}
            strokeWidth={2}
            style={{
              color: 'var(--lp-text-tertiary)',
              flexShrink: 0,
            }}
          />
        ) : (
          <ChevronDown
            aria-hidden
            size={12}
            strokeWidth={2}
            style={{
              color: 'var(--lp-text-tertiary)',
              flexShrink: 0,
            }}
          />
        )}
      </button>

      {dropdownState !== 'closed' ? (
        <div
          ref={panelRef}
          className="lp-ats-panel"
          /* Sprint 6 §1: omit data-state during 'opening' so the
             base CSS paints for one frame (opacity 0, translateY).
             Next-raf flips to 'open'; transition fires. */
          data-state={
            dropdownState === 'opening' ? undefined : dropdownState
          }
          onTransitionEnd={handlePanelTransitionEnd}
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + var(--lp-space-1))',
            left: 0,
            zIndex: 'var(--lp-z-dropdown)',
            minWidth: 320,
            maxWidth: 360,
            maxHeight: 'min(420px, 60vh)',
            background: 'var(--lp-panel)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            boxShadow: 'var(--lp-shadow-popover)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              position: 'relative',
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {/* Active pane */}
            <SwitcherPane
              key={`active-${pane}`}
              mountAnim={
                exitingPane
                  ? paneDirection === 'forward'
                    ? 'enter-from-right'
                    : 'enter-from-left'
                  : 'idle'
              }
              absolute={!!exitingPane}
              onTransitionEnd={handlePaneTransitionEnd}
            >
              {pane === 'artists' ? (
                <ArtistsPane
                  artists={artists}
                  selectedArtistId={selectedArtistId}
                  onPick={handleArtistClick}
                  onClose={closeDropdown}
                />
              ) : (
                <ToursPane
                  artistName={dropdownArtistName}
                  yearGroups={yearGroups}
                  totalTours={tours.length}
                  loading={toursLoading}
                  selectedTourId={selectedTourId}
                  onPick={handleTourClick}
                  onBack={handleBackToArtists}
                  onClose={closeDropdown}
                  onCreateTour={onCreateTour}
                />
              )}
            </SwitcherPane>

            {/* Exiting pane (mounted only during transition) */}
            {exitingPane ? (
              <SwitcherPane
                key={`exiting-${exitingPane}`}
                mountAnim={
                  paneDirection === 'forward'
                    ? 'exit-to-left'
                    : 'exit-to-right'
                }
                absolute
                onTransitionEnd={handlePaneTransitionEnd}
              >
                {exitingPane === 'artists' ? (
                  <ArtistsPane
                    artists={artists}
                    selectedArtistId={selectedArtistId}
                    onPick={() => {
                      /* exiting pane: clicks ignored */
                    }}
                    onClose={() => {
                      /* exiting pane: ignored */
                    }}
                  />
                ) : (
                  <ToursPane
                    artistName={dropdownArtistName}
                    yearGroups={yearGroups}
                    totalTours={tours.length}
                    selectedTourId={selectedTourId}
                    onPick={() => {
                      /* exiting pane */
                    }}
                    onBack={() => {
                      /* exiting pane */
                    }}
                    onClose={() => {
                      /* exiting pane */
                    }}
                    onCreateTour={() => {
                      /* exiting pane */
                    }}
                  />
                )}
              </SwitcherPane>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ============================================================
   Pane wrapper — handles absolute positioning + the two-frame
   raf pattern that drives the enter/exit CSS transitions.

   Sprint 6 §1: the parent passes one of five `mountAnim` values:

     'idle'              — no transition. Pane mounts in active
                           state and stays there.
     'enter-from-right'  — mount at translateX(8px), opacity 0
                           (transition: none in CSS). Next raf
                           flips data-pane-state to 'active' →
                           transition slides+fades to active.
     'enter-from-left'   — same, mirrored.
     'exit-to-left'      — mount at translateX(0), opacity 1
                           ('active' state). Next raf flips to
                           'exit-to-left' → transition slides+
                           fades out.
     'exit-to-right'     — same, mirrored.

   Without the raf the entering pane mounts already at its final
   position (no transition) — Adam's Sprint 5 SR "jumps both
   ways" smoke. The raf gives the browser one paint frame at the
   start state before the transition target is set.
   ============================================================ */
function SwitcherPane({
  children,
  mountAnim,
  absolute,
  onTransitionEnd,
}: {
  children: React.ReactNode;
  mountAnim: PaneAnim;
  absolute: boolean;
  onTransitionEnd: (e: React.TransitionEvent<HTMLDivElement>) => void;
}) {
  // 'mount' = first paint frame at the start position (or 'active'
  // for exit anims). 'animate' = next raf, target position set,
  // CSS transition fires.
  const [phase, setPhase] = useState<'mount' | 'animate'>(
    mountAnim === 'idle' ? 'animate' : 'mount',
  );

  // useLayoutEffect runs synchronously after DOM mutations but
  // BEFORE the browser paints. We schedule the raf from inside
  // it so the request lands AFTER React has painted the mount
  // frame. The raf callback flips phase to 'animate', triggering
  // a re-render that sets the target data-pane-state and the CSS
  // transition fires.
  useLayoutEffect(() => {
    if (mountAnim === 'idle') return;
    let raf = 0;
    raf = requestAnimationFrame(() => {
      setPhase('animate');
    });
    return () => cancelAnimationFrame(raf);
  }, [mountAnim]);

  let dataPaneState: string | undefined;
  if (mountAnim === 'idle') {
    dataPaneState = undefined; // base CSS = active
  } else if (
    mountAnim === 'enter-from-right' ||
    mountAnim === 'enter-from-left'
  ) {
    dataPaneState = phase === 'mount' ? mountAnim : 'active';
  } else {
    // exit-to-left / exit-to-right
    dataPaneState = phase === 'mount' ? 'active' : mountAnim;
  }

  return (
    <div
      className="lp-ats-pane"
      data-pane-state={dataPaneState}
      onTransitionEnd={onTransitionEnd}
      style={{
        position: absolute ? 'absolute' : 'relative',
        inset: absolute ? 0 : undefined,
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minHeight: 0,
      }}
    >
      {children}
    </div>
  );
}

/* ============================================================
   Artists pane
   ============================================================ */
function ArtistsPane({
  artists,
  selectedArtistId,
  onPick,
  onClose,
}: {
  artists: ArtistMin[];
  selectedArtistId: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <PaneHeader
        leading={null}
        labelLeft="Artists"
        countRight={artists.length}
        trailing={
          <CloseChevron onClick={onClose} ariaLabel="Close artist list" />
        }
      />
      <div
        style={{
          overflowY: 'auto',
          flex: 1,
          minHeight: 0,
          padding: 'var(--lp-space-1) var(--lp-space-2) var(--lp-space-2)',
        }}
      >
        {artists.length === 0 ? (
          <EmptyState message="No artists yet." />
        ) : (
          artists.map((a) => {
            const selected = a.id === selectedArtistId;
            const img = pickArtistImage(a);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onPick(a.id)}
                className="btn-transition"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--lp-space-3)',
                  width: '100%',
                  height: 36,
                  padding: '0 var(--lp-space-2)',
                  borderRadius: 'var(--lp-radius-sm)',
                  background: selected
                    ? 'var(--color-lp-orange-subtle-hover)'
                    : 'transparent',
                  borderLeft: selected
                    ? '2px solid var(--color-lp-orange)'
                    : '2px solid transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (!selected) {
                    e.currentTarget.style.background =
                      'var(--lp-panel-hover)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!selected) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <ArtistAvatar imageUrl={img} name={a.name} />
                <span
                  className="min-w-0 truncate"
                  style={{
                    flex: 1,
                    fontSize: 'var(--lp-text-base)',
                    color: 'var(--lp-text)',
                  }}
                >
                  {a.name}
                </span>
                <ChevronRight
                  aria-hidden
                  size={12}
                  strokeWidth={2}
                  style={{
                    color: 'var(--lp-text-tertiary)',
                    flexShrink: 0,
                  }}
                />
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

/* ============================================================
   Tours pane
   ============================================================ */
function ToursPane({
  artistName,
  yearGroups,
  totalTours,
  loading = false,
  selectedTourId,
  onPick,
  onBack,
  onClose,
  onCreateTour,
}: {
  artistName: string;
  yearGroups: YearGroup[];
  totalTours: number;
  /** Sprint 6 §2 sub-bug B — wrapper sets this true while it
   *  fetches a newly-selected artist's tours. The pane shows a
   *  small spinner instead of an empty list so the user
   *  doesn't see the previous artist's tours linger. */
  loading?: boolean;
  selectedTourId: string | null;
  onPick: (id: string) => void;
  onBack: () => void;
  onClose: () => void;
  onCreateTour: () => void;
}) {
  return (
    <>
      <PaneHeader
        leading={
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to artists"
            className="btn-transition flex items-center justify-center"
            style={{
              width: 24,
              height: 24,
              borderRadius: 'var(--lp-radius-sm)',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--lp-text-secondary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--lp-panel-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
        }
        labelLeft={artistName}
        labelLeftIsBody
        trailing={
          <CloseChevron onClick={onClose} ariaLabel="Close tour list" />
        }
      />
      <div
        style={{
          padding:
            'var(--lp-space-2) var(--lp-space-4) var(--lp-space-1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          className="lp-label-caps"
          style={{ color: 'var(--lp-text-tertiary)' }}
        >
          Tours
        </span>
        <span
          style={{
            fontSize: 'var(--lp-text-2xs)',
            color: 'var(--lp-text-tertiary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {totalTours}
        </span>
      </div>
      <div
        style={{
          overflowY: 'auto',
          flex: 1,
          minHeight: 0,
          padding:
            'var(--lp-space-1) var(--lp-space-2) var(--lp-space-2)',
        }}
      >
        {loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--lp-space-2)',
              padding: 'var(--lp-space-6) var(--lp-space-3)',
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            <Loader2
              size={14}
              strokeWidth={2}
              className="animate-spin"
            />
            Loading tours…
          </div>
        ) : totalTours === 0 ? (
          <EmptyState message="No tours yet." />
        ) : (
          yearGroups.map((g) => (
            <div key={g.year ?? 'undated'}>
              <div
                style={{
                  padding:
                    'var(--lp-space-2) var(--lp-space-2) var(--lp-space-1)',
                }}
              >
                <span
                  className="lp-label-caps"
                  style={{ color: 'var(--lp-text-tertiary)' }}
                >
                  {g.year ?? 'Undated'}
                </span>
              </div>
              {g.tours.map((t) => {
                const selected = t.id === selectedTourId;
                const range = formatTourDateRange(
                  t.start_date,
                  t.end_date,
                );
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onPick(t.id)}
                    className="btn-transition"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 2,
                      width: '100%',
                      minHeight: 44,
                      padding:
                        'var(--lp-space-2) var(--lp-space-2)',
                      borderRadius: 'var(--lp-radius-sm)',
                      background: selected
                        ? 'var(--color-lp-orange-subtle-hover)'
                        : 'transparent',
                      borderLeft: selected
                        ? '2px solid var(--color-lp-orange)'
                        : '2px solid transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) {
                        e.currentTarget.style.background =
                          'var(--lp-panel-hover)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <span
                      className="truncate"
                      style={{
                        fontSize: 'var(--lp-text-base)',
                        color: 'var(--lp-text)',
                        fontWeight: 'var(--lp-weight-medium)',
                        maxWidth: '100%',
                      }}
                    >
                      {t.name}
                    </span>
                    {range ? (
                      <span
                        style={{
                          fontSize: 'var(--lp-text-xs)',
                          color: 'var(--lp-text-secondary)',
                        }}
                      >
                        {range}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))
        )}
        {/* "+ Create new tour" CTA — at the bottom, OUTSIDE every
            year group. */}
        <button
          type="button"
          onClick={onCreateTour}
          className="btn-transition"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--lp-space-2)',
            width: '100%',
            height: 36,
            marginTop: 'var(--lp-space-2)',
            padding: '0 var(--lp-space-2)',
            borderRadius: 'var(--lp-radius-sm)',
            background: 'transparent',
            color: 'var(--color-lp-orange)',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: 'var(--lp-text-base)',
            fontWeight: 'var(--lp-weight-medium)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background =
              'var(--color-lp-orange-subtle-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <Plus size={14} strokeWidth={2.25} aria-hidden />
          Create new tour
        </button>
      </div>
    </>
  );
}

/* ============================================================
   Smaller pieces
   ============================================================ */

function PaneHeader({
  leading,
  labelLeft,
  labelLeftIsBody,
  countRight,
  trailing,
}: {
  leading: React.ReactNode;
  labelLeft: string;
  /** When true, render labelLeft as body text (used for the
   *  artist name in the tours-pane header). Default is the
   *  uppercase tracked-wider label-caps treatment. */
  labelLeftIsBody?: boolean;
  countRight?: number;
  trailing: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--lp-space-2)',
        padding: 'var(--lp-space-2) var(--lp-space-3)',
        borderBottom: '1px solid var(--lp-border-subtle)',
        flexShrink: 0,
      }}
    >
      {leading}
      <span
        className={labelLeftIsBody ? 'min-w-0 truncate' : 'lp-label-caps'}
        style={
          labelLeftIsBody
            ? {
                flex: 1,
                fontSize: 'var(--lp-text-base)',
                color: 'var(--lp-text)',
                fontWeight: 'var(--lp-weight-medium)',
              }
            : {
                flex: 1,
                color: 'var(--lp-text-tertiary)',
              }
        }
      >
        {labelLeft}
      </span>
      {countRight !== undefined ? (
        <span
          style={{
            fontSize: 'var(--lp-text-2xs)',
            color: 'var(--lp-text-tertiary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {countRight}
        </span>
      ) : null}
      {trailing}
    </div>
  );
}

function CloseChevron({
  onClick,
  ariaLabel,
}: {
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="btn-transition flex items-center justify-center"
      style={{
        width: 24,
        height: 24,
        borderRadius: 'var(--lp-radius-sm)',
        background: 'transparent',
        cursor: 'pointer',
        color: 'var(--lp-text-secondary)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--lp-panel-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <ChevronUp size={14} strokeWidth={2} />
    </button>
  );
}

function ArtistAvatar({
  imageUrl,
  name,
}: {
  imageUrl: string | null;
  name: string;
}) {
  if (imageUrl) {
    // Arbitrary remote URLs from artist branding / Spotify; next/image
    // needs per-domain config and these are 24px decorative thumbnails
    // so the optimizer adds no value.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        width={24}
        height={24}
        style={{
          width: 24,
          height: 24,
          borderRadius: 'var(--lp-radius-full)',
          objectFit: 'cover',
          flexShrink: 0,
          background: 'var(--lp-bg-deep)',
        }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        borderRadius: 'var(--lp-radius-full)',
        background: 'var(--color-lp-orange)',
        color: 'var(--lp-text-inverse)',
        fontSize: 'var(--lp-text-2xs)',
        fontWeight: 'var(--lp-weight-bold)',
        flexShrink: 0,
      }}
    >
      {getInitials(name)}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        padding:
          'var(--lp-space-4) var(--lp-space-3)',
        textAlign: 'center',
        fontSize: 'var(--lp-text-sm)',
        color: 'var(--lp-text-tertiary)',
      }}
    >
      {message}
    </div>
  );
}
