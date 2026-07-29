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

   Animations (Sprint 6.1 §3) are driven by the Web Animations
   API (element.animate()) inside useLayoutEffect, NOT CSS
   transitions or keyframes. Background: Sprint 6's CSS-transition
   approach with a two-frame raf pattern relied on React giving
   the browser a paint frame between the mount-state and the
   animate-state, but React 19's automatic batching collapsed the
   two state updates into a single render → only the final state
   painted → no transition. Web Animations escapes the React
   render lifecycle entirely. prefers-reduced-motion handled via
   matchMedia inline, not @media in globals.css.
   ============================================ */

'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Plus,
  Trash2,
  User,
} from 'lucide-react';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { useProductContext } from '@/contexts/ProductContext';
import {
  useSwitcherState,
  type DropdownState,
  type Pane as SwitcherPane,
} from '@/contexts/SwitcherStateContext';
import { ContextMenu } from '@/components/ui/ContextMenu';

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
  /** Sprint 8 §5 — called when the user clicks "+ Create new
   *  artist" at the bottom of the artists pane. Wrapper opens
   *  the artist slide-over. */
  onCreateArtist: () => void;
  /** Sprint 8.1 §5 — called when the user picks "Delete tour"
   *  from the per-row ⋮ menu in the tours pane. The wrapper
   *  opens <TourDeleteConfirmationModal> with the chosen tour. */
  onDeleteTour?: (tour: { id: string; name: string }) => void;
  /** Sprint 8.4 §3 — called when the user picks "Delete artist…"
   *  from the per-row ⋮ menu in the artists pane. The wrapper
   *  opens <ArtistDeleteConfirmationModal>. */
  onDeleteArtist?: (artist: { id: string; name: string }) => void;
  /** S-2a — the names the SERVER already knew for this URL.
   *
   *  A tour URL carries only the tour id, so on a cold load the context has no
   *  artist until <HydrateTourArtist> runs in an effect, and the trigger sat on
   *  "Pick an artist…" for a frame — on a tour page, of all places, where the
   *  answer was never in doubt. These are last-resort fallbacks: anything the
   *  context or the fetched lists know still wins, so they can't go stale. */
  fallbackArtistName?: string | null;
  fallbackTourName?: string | null;
}

/** Sprint 6.1 §3 — animations are now driven by the Web
 *  Animations API (element.animate()) inside useLayoutEffect, so
 *  React's render cycle never gets in the way of the from-frame
 *  paint. State machine reverts to plain closed/open/closing —
 *  no two-frame intermediate needed.
 *
 *  Sprint 8.3 §1 — DropdownState now lives in
 *  src/contexts/SwitcherStateContext.tsx (via the provider).
 *  Pane stays as a local alias because several internal types
 *  (PaneAnim, SwitcherPane prop signatures) still reference it. */
type Pane = SwitcherPane;

type PaneAnim =
  | 'idle'
  | 'enter-from-right'
  | 'enter-from-left'
  | 'exit-to-left'
  | 'exit-to-right';

/** Animation timing — matches the durations + easings the CSS used
 *  to declare. Inlined here because they're consumed by
 *  Element.animate() which doesn't accept CSS variables. Source of
 *  truth is still globals.css; if those tokens change, mirror here.
 *
 *  --lp-duration-base = 150ms       (close)
 *  --lp-duration-slow = 200ms       (open)
 *  --lp-duration-slower = 250ms     (pane transition)
 *  --lp-ease-decelerate = cubic-bezier(0, 0, 0.2, 1)
 *  --lp-ease-accelerate = cubic-bezier(0.4, 0, 1, 1)
 *  --lp-ease-standard   = cubic-bezier(0.4, 0, 0.2, 1) */
const ANIM = {
  panelOpenMs: 200,
  panelCloseMs: 150,
  paneSwitchMs: 250,
  reducedMs: 50,
  easeDecelerate: 'cubic-bezier(0, 0, 0.2, 1)',
  easeAccelerate: 'cubic-bezier(0.4, 0, 1, 1)',
  easeStandard: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Sprint 6.2 §2 — cancel an animation, but only if it hasn't
 *  already finished. Cancelling a finished animation removes
 *  its persisted-fill effect (the spec calls it "associated
 *  effect") and reverts the element to its un-animated state.
 *  For our use, that means a finished enter animation suddenly
 *  flashes back to opacity:0/translateX(8px) when the parent
 *  re-renders and the effect re-runs with mountAnim='idle'. */
function safeCancel(a: Animation | null): void {
  if (a && a.playState !== 'finished') a.cancel();
}

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
  onCreateArtist,
  onDeleteTour,
  onDeleteArtist,
  fallbackArtistName = null,
  fallbackTourName = null,
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
  //
  // S-2a — the server-supplied names are the LAST fallback, after the context
  // and the prefetched lists. On a tour URL those two have nothing to say until
  // hydration, which is exactly the frame the flash lived in.
  const displayArtistName =
    selectedArtist?.name ??
    artists.find((a) => a.id === selectedArtistId)?.name ??
    fallbackArtistName ??
    null;
  const displayTourName =
    selectedTour?.name ??
    tours.find((t) => t.id === selectedTourId)?.name ??
    fallbackTourName ??
    null;

  /* -------- dropdown state machine --------
   *
   * Sprint 8.3 §1 — state is held in <SwitcherStateProvider>
   * mounted at (app)/layout.tsx. The provider lives above the
   * dynamic-segment subtree, so its useState values survive
   * /artists/[id], /budget/[tourId], etc. navigation. The
   * switcher itself can still remount on those nav events,
   * but its state lives in the never-unmounting context.
   *
   * Replaces Sprint 8.2 §2's sessionStorage rehydration —
   * which worked but produced a visible close+reopen flash
   * because the wrapper still remounted and re-read storage
   * mid-paint. Adam's smoke: "still doesn't animate." */
  const {
    dropdownState,
    setDropdownState,
    pane,
    setPane,
    // The pane currently animating OUT (rendered alongside the
    // new pane during the 250ms cross-fade). null when no
    // transition.
    exitingPane,
    setExitingPane,
    // Direction of the in-flight pane transition. Determines
    // which CSS data-pane-state value each pane uses.
    paneDirection,
    setPaneDirection,
  } = useSwitcherState();

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelAnimRef = useRef<Animation | null>(null);

  const open = dropdownState === 'open' || dropdownState === 'closing';

  const initialPaneOnOpen: Pane = selectedArtistId ? 'tours' : 'artists';

  const openDropdown = useCallback(() => {
    setPane(initialPaneOnOpen);
    setExitingPane(null);
    setDropdownState('open');
  }, [initialPaneOnOpen, setPane, setExitingPane, setDropdownState]);

  const closeDropdown = useCallback(() => {
    setDropdownState((prev) => (prev === 'open' ? 'closing' : prev));
  }, [setDropdownState]);

  // Sprint 6.1 §3 — Web Animations API drives the panel open/close.
  // useLayoutEffect is required: it runs synchronously after DOM
  // mutations but BEFORE the browser paints, so .animate() lands
  // before the panel's first paint. With useEffect (post-paint) the
  // browser would paint once at default styles → animate to start
  // → animate to end, producing a backwards flash. fill: 'forwards'
  // only persists the END state after the animation completes; it
  // doesn't paint the start state pre-animation.
  //
  // Sprint 8.6 §1 — Adam's smoke against 8.5: "It closes, reopens,
  // then the artist page changes and it stays open." Defensive
  // fix for the close+reopen flash on same-product navigation:
  //
  //   1. lastAnimatedStateRef guard — bail early if dropdownState
  //      hasn't changed since last animation. Catches any
  //      spurious re-fire of this effect (e.g. setDropdownState
  //      reference changing through context destructuring under
  //      a parent re-render).
  //
  //   2. safeCancel instead of raw .cancel() — only cancels
  //      animations whose playState is still 'running' /
  //      'finishing'. Preserves the persisted-fill of finished
  //      animations so the panel doesn't briefly revert to the
  //      from-frame (opacity 0) when the effect re-fires.
  //      Sprint 6.2 §2 used safeCancel for the same reason on
  //      pane animations; line 369's raw cancel() was missed.
  const lastAnimatedStateRef = useRef<DropdownState | null>(null);
  useLayoutEffect(() => {
    if (lastAnimatedStateRef.current === dropdownState) return;
    lastAnimatedStateRef.current = dropdownState;
    const el = panelRef.current;
    if (!el) return;
    safeCancel(panelAnimRef.current);
    const reduce = prefersReducedMotion();
    if (dropdownState === 'open') {
      panelAnimRef.current = el.animate(
        [
          { opacity: 0, transform: 'translateY(-4px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        {
          duration: reduce ? ANIM.reducedMs : ANIM.panelOpenMs,
          easing: ANIM.easeDecelerate,
          fill: 'forwards',
        },
      );
    } else if (dropdownState === 'closing') {
      panelAnimRef.current = el.animate(
        [
          { opacity: 1, transform: 'translateY(0)' },
          { opacity: 0, transform: 'translateY(-4px)' },
        ],
        {
          duration: reduce ? ANIM.reducedMs : ANIM.panelCloseMs,
          easing: ANIM.easeAccelerate,
          fill: 'forwards',
        },
      );
      panelAnimRef.current.onfinish = () => {
        // onfinish fires async after the animation completes;
        // flip to 'closed' to unmount the panel.
        setDropdownState((prev) => (prev === 'closing' ? 'closed' : prev));
      };
    }
  }, [dropdownState, setDropdownState]);

  // Cancel any in-flight animation on unmount.
  useEffect(() => {
    return () => {
      panelAnimRef.current?.cancel();
      panelAnimRef.current = null;
    };
  }, []);

  // Sprint 8 §4 — replaces Sprint 7 §1.A's pathname-change
  // effect (which closed the dropdown on any path mutation,
  // including programmatic router.push from inside the
  // switcher itself, breaking the artist→tour pane transition
  // on /artists/[X]). popstate fires only on browser back/fwd
  // and history.back/forward calls — NOT on router.push or
  // router.replace. That's the precise "wanted close"
  // semantics: external navigation closes the dropdown,
  // internal switcher actions don't.
  useEffect(() => {
    function onPopState() {
      setDropdownState('closed');
      setExitingPane(null);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [setDropdownState, setExitingPane]);

  // Sprint 8.3 §3 — close the dropdown on cross-product nav.
  // After Sprint 8.3 §1 lifted state into the workspace-level
  // SwitcherStateProvider, the dropdown stays open by default
  // across ANY navigation — including jumping from /artists/[X]
  // to /budget/[Y] which Adam's prompt expects to close it
  // ("V.3: cross-product nav (/artists → /budget/[X]) closes
  // dropdown (expected)"). Watch the product silo from
  // ProductContext (whose `current` is derived from pathname);
  // when it changes, close. The popstate handler above stays
  // for browser back/fwd within the same product silo.
  const product = useProductContext().current;
  const lastProductRef = useRef(product);
  useEffect(() => {
    if (lastProductRef.current !== product) {
      lastProductRef.current = product;
      setDropdownState('closed');
      setExitingPane(null);
    }
  }, [product, setDropdownState, setExitingPane]);

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
    [setPane, setExitingPane, setPaneDirection],
  );

  // After the exiting pane's transition completes, drop it from
  // the DOM. Sprint 6 §1: switched from animationend (keyframes)
  // Sprint 6.1 §3 — exit animation finished, drop the exiting
  // pane from the DOM. Called by SwitcherPane's onfinish hook
  // when its mountAnim is exit-to-left/right.
  const handlePaneExitDone = useCallback(() => {
    setExitingPane(null);
  }, [setExitingPane]);

  /* -------- list interaction -------- */
  const handleArtistClick = useCallback(
    (id: string) => {
      transitionToPane('tours', 'forward');
      // Sprint 6.2 §1 — when the user is on /artists/[X]/...,
      // navigate to the new artist's home. The path-aware
      // hydration in ArtistTourContext (Sprint 4) reads
      // `selectedArtistId` off the new path-segment automatically,
      // so we DON'T also call setSelectedArtistId(id) — that
      // would fire a syncUrlParams → router.replace BEFORE the
      // router.push, producing two URL writes Next 16 doesn't
      // batch cleanly (the cause of the Sprint 6.1 trigger-stale
      // bug Adam smoke-flagged).
      if (pathname?.startsWith('/artists/')) {
        router.push(`/artists/${id}`);
        return;
      }
      // Stay-put case (e.g. /budget/[X], /personnel) — switcher
      // is just changing pane state to show this artist's tours;
      // no navigation. Context-only update is correct here.
      setSelectedArtistId(id);
    },
    [setSelectedArtistId, transitionToPane, pathname, router],
  );

  const handleTourClick = useCallback(
    (id: string) => {
      closeDropdown();
      const productMatch = pathname?.match(
        /^\/(budget|advance|operations)\//,
      );
      if (productMatch) {
        // Sprint 6.2 §1 — push to product-scoped URL only. The
        // path-aware hydration sets context selectedTourId from
        // the new path-segment. Calling setSelectedTourId(id)
        // here too would fire a router.replace with the OLD path-
        // segment + new ?tour_id= query, racing the push.
        router.push(`/${productMatch[1]}/${id}`);
        return;
      }
      if (pathname?.startsWith('/artists/')) {
        // Default to /budget/[id] from artist home — user can
        // re-rail from there.
        router.push(`/budget/${id}`);
        return;
      }
      // Stay-put case — context-only update.
      setSelectedTourId(id);
    },
    [setSelectedTourId, closeDropdown, pathname, router],
  );

  const handleBackToArtists = useCallback(() => {
    transitionToPane('artists', 'back');
  }, [transitionToPane]);

  // Sprint 8 §4 — "All artists" link at the top of the artists
  // pane. Closes the dropdown, navigates to the workspace
  // landing.
  const handleAllArtists = useCallback(() => {
    closeDropdown();
    router.push('/artists');
  }, [closeDropdown, router]);

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
          // Sprint 6.2 §3 — 36px chip-style trigger. The Sprint 6.1
          // two-row 56px design overflowed the 48px ProductHeader.
          // Single row keeps the trigger inside the bar.
          height: 36,
          maxWidth: 380,
          fontSize: 'var(--lp-text-base)',
          fontWeight: 'var(--lp-weight-medium)',
          color: triggerEmpty
            ? 'var(--lp-text-secondary)'
            : 'var(--lp-text)',
          background: open ? 'var(--lp-panel-hover)' : 'var(--lp-panel)',
          // Sprint 7 §1.C — orange accent applied via inset
          // box-shadow instead of a 2px border-left. The 1px↔2px
          // border swap shifted contents by 1px on open (Adam's
          // smoke "1px jiggle"); inset shadow paints inside the
          // border-box without affecting layout.
          border: '1px solid var(--lp-border-strong)',
          boxShadow: open
            ? 'inset 2px 0 0 var(--color-lp-orange)'
            : undefined,
          borderRadius: 'var(--lp-radius-md)',
          cursor: 'pointer',
          textAlign: 'left',
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
        {/* 24px avatar slot — image / initials chip for selected
            artist; dashed-border User placeholder for the no-artist
            empty state. */}
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

        {/* Single-row label: "Artist · Tour" with a centred-dot
            separator. Empty states collapse to "Pick an artist…"
            or "Artist · Pick a tour…". */}
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
              {/* Sprint 8.1 §1 added a third dot-segment with a
                  per-product key stat (67% SPENT / 82% COMPLETE /
                  12 CREW). Sprint 8.2 §1 — Adam's smoke: "PASS BUT
                  the info is irrelevant. remove it." Trigger goes
                  back to [avatar] Artist · Tour [chevron]. */}
            </>
          )}
        </span>

        {/* Trailing chevron — 12px, proportionate to the 36px chip. */}
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
          role="menu"
          /* Sprint 6.1 §3 — animation comes from element.animate()
             in a useLayoutEffect above. No CSS data-state, no
             onTransitionEnd. Initial inline opacity:0 so the
             pre-animation paint (if any racing condition slips
             through) doesn't show full-opacity content. */
          style={{
            position: 'absolute',
            top: 'calc(100% + var(--lp-space-1))',
            left: 0,
            zIndex: 'var(--lp-z-dropdown)',
            minWidth: 320,
            maxWidth: 360,
            // Sprint 8.6.1 — drop the panel-level maxHeight + flex
            // chain. Sprint 8.6 §2 attempted to make the inner
            // scroll list resolve from `flex: 1 1 0` under a
            // `maxHeight: min(600px, 70vh)` clamp, but the
            // position:absolute panel never gets a resolved height
            // (intrinsic, not laid out by a flex/grid parent), so
            // children with `flex: 1` collapse to ~200px and the
            // scroll bar sits on a too-short list.
            //
            // New approach: panel sizes to its content. The inner
            // artists/tours scroll lists have `maxHeight: 400` +
            // `overflowY: auto` directly — they cap at 400px and
            // scroll past that, otherwise the panel grows to fit.
            // No flex height inheritance required.
            background: 'var(--lp-panel)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            boxShadow: 'var(--lp-shadow-popover)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            opacity: 0,
          }}
        >
          <div
            style={{
              position: 'relative',
              // Sprint 8.6.1 — wrapper sizes to the active pane's
              // content. The exiting pane is position:absolute +
              // inset:0 so it overlays this box during the
              // pane-switch animation; that still works with an
              // intrinsic-height parent.
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
              onExitDone={handlePaneExitDone}
            >
              {pane === 'artists' ? (
                <ArtistsPane
                  artists={artists}
                  selectedArtistId={selectedArtistId}
                  onPick={handleArtistClick}
                  onClose={closeDropdown}
                  onAllArtists={handleAllArtists}
                  onCreateArtist={onCreateArtist}
                  onDeleteArtist={
                    onDeleteArtist
                      ? (artist) => {
                          // Sprint 8.4 §3 — close the dropdown
                          // first so the modal owns focus, then
                          // hand off to the wrapper which mounts
                          // <ArtistDeleteConfirmationModal>.
                          closeDropdown();
                          onDeleteArtist(artist);
                        }
                      : undefined
                  }
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
                  onDeleteTour={
                    onDeleteTour
                      ? (tour) => {
                          // Sprint 8.1 §5 — close the dropdown first
                          // so the modal owns the user's focus, then
                          // hand off to the wrapper which mounts
                          // <TourDeleteConfirmationModal>.
                          closeDropdown();
                          onDeleteTour(tour);
                        }
                      : undefined
                  }
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
                onExitDone={handlePaneExitDone}
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
                    onAllArtists={() => {
                      /* exiting pane: ignored */
                    }}
                    onCreateArtist={() => {
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
   Pane wrapper — handles absolute positioning + the enter/exit
   animation via the Web Animations API.

   Sprint 6.1 §3: animations driven by element.animate() inside
   useLayoutEffect (NOT useEffect). useLayoutEffect runs
   synchronously after DOM mutations but BEFORE the browser
   paints, so .animate() is established before the first paint —
   no backwards flash.

   `mountAnim`:
     'idle'             — no animation. Pane appears static.
     'enter-from-right' — animates from translateX(8px) opacity 0
                          to translateX(0) opacity 1.
     'enter-from-left'  — mirrored.
     'exit-to-left'     — animates from active to translateX(-8px)
                          opacity 0; calls onExitDone on finish.
     'exit-to-right'    — mirrored.
   ============================================================ */
function SwitcherPane({
  children,
  mountAnim,
  absolute,
  onExitDone,
}: {
  children: React.ReactNode;
  mountAnim: PaneAnim;
  absolute: boolean;
  /** Called when an exit-* animation finishes — parent uses
   *  this to drop the exiting pane from the DOM. */
  onExitDone: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<Animation | null>(null);

  // Sprint 6.2 §2 — keep the latest onExitDone in a ref so the
  // animation effect can read it from inside onfinish without
  // depending on it. onExitDone IS stable in current callers
  // (handlePaneExitDone is useCallback with empty deps), but
  // the ref is defensive against future inline () => {...}
  // callers that would re-create the function on every parent
  // render and re-trigger the effect → cancel/restart loop.
  const onExitDoneRef = useRef(onExitDone);
  useEffect(() => {
    onExitDoneRef.current = onExitDone;
  }, [onExitDone]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    safeCancel(animRef.current);
    if (mountAnim === 'idle') return;
    const reduce = prefersReducedMotion();
    const duration = reduce ? ANIM.reducedMs : ANIM.paneSwitchMs;

    let from: Keyframe;
    let to: Keyframe;
    if (mountAnim === 'enter-from-right') {
      from = { opacity: 0, transform: 'translateX(8px)' };
      to = { opacity: 1, transform: 'translateX(0)' };
    } else if (mountAnim === 'enter-from-left') {
      from = { opacity: 0, transform: 'translateX(-8px)' };
      to = { opacity: 1, transform: 'translateX(0)' };
    } else if (mountAnim === 'exit-to-left') {
      from = { opacity: 1, transform: 'translateX(0)' };
      to = { opacity: 0, transform: 'translateX(-8px)' };
    } else {
      // exit-to-right
      from = { opacity: 1, transform: 'translateX(0)' };
      to = { opacity: 0, transform: 'translateX(8px)' };
    }

    animRef.current = el.animate([from, to], {
      duration,
      easing: ANIM.easeStandard,
      fill: 'forwards',
    });

    if (mountAnim === 'exit-to-left' || mountAnim === 'exit-to-right') {
      animRef.current.onfinish = () => {
        onExitDoneRef.current();
      };
    }

    return () => {
      // Sprint 6.2 §2 — safeCancel skips finished animations so
      // the persisted-fill effect isn't removed when the parent
      // re-renders post-transition (mountAnim flips from
      // enter-from-* to idle). Without this, the entering pane
      // would flash back to opacity:0 / translateX(8px) at the
      // moment exitingPane goes null.
      safeCancel(animRef.current);
      animRef.current = null;
    };
  }, [mountAnim]);

  // Initial inline opacity matches the from-keyframe so any race
  // with the .animate() establishment doesn't flash full-opacity
  // content for one frame. Idle panes start at opacity 1.
  const initialOpacity =
    mountAnim === 'idle' || mountAnim.startsWith('exit-') ? 1 : 0;

  return (
    <div
      ref={ref}
      className="lp-ats-pane"
      style={{
        position: absolute ? 'absolute' : 'relative',
        inset: absolute ? 0 : undefined,
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        // Sprint 8.6.1 — pane sizes to content. The active pane
        // (position:relative) defines the parent's height; the
        // exiting pane (position:absolute, inset:0) overlays
        // exactly that box for the swap animation.
        opacity: initialOpacity,
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
  onAllArtists,
  onCreateArtist,
  onDeleteArtist,
}: {
  artists: ArtistMin[];
  selectedArtistId: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
  /** Sprint 8 §4 — small button at the top of the artists pane.
   *  Click navigates to /artists (workspace landing). The
   *  parent passes a function that does router.push + close. */
  onAllArtists: () => void;
  /** Sprint 8 §5 — opens the ArtistCreateSlideOver. Wired by
   *  the parent from the wrapper's setIsCreateArtistOpen. */
  onCreateArtist: () => void;
  /** Sprint 8.4 §3 — when defined, each artist row shows a ⋮
   *  overflow menu with a "Delete artist…" item. Wrapper
   *  mounts <ArtistDeleteConfirmationModal> with the chosen
   *  artist. Undefined = no menu. */
  onDeleteArtist?: (artist: { id: string; name: string }) => void;
}) {
  return (
    <>
      {/* Sprint 8 §4 — "← All artists" link at the top of the
          artists pane only. Click jumps to the workspace landing.
          Subtle styling so it doesn't dominate the pane header. */}
      <button
        type="button"
        onClick={onAllArtists}
        className="btn-transition flex items-center"
        style={{
          gap: 'var(--lp-space-1)',
          width: '100%',
          padding:
            'var(--lp-space-2) var(--lp-space-3)',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text-secondary)',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--lp-border-subtle)',
          textAlign: 'left',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--lp-text)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--lp-text-secondary)';
        }}
      >
        <ChevronLeft aria-hidden size={12} strokeWidth={2} />
        All artists
      </button>
      <PaneHeader
        leading={null}
        labelLeft="Artists"
        countRight={artists.length}
        trailing={
          <CloseChevron onClick={onClose} ariaLabel="Close artist list" />
        }
      />
      {/* Sprint 8.5 §2 — artist rows scroll independently of the
          create CTA. Previously both shared an overflow-y container
          which pushed the Create button below the fold once the
          list grew past ~8 entries. Now the scroll area is rows-
          only; the CTA sits in a flexShrink: 0 sibling row that
          stays pinned to the pane's bottom regardless of scroll.
          Sprint 8.6.1 — direct maxHeight + overflowY:auto. The
          §2 flex-chain attempt was defeated by the panel's lack
          of a resolved height (position:absolute panels don't
          inherit one). Putting the cap on the scroll list itself
          sidesteps the flex-inheritance problem entirely: the
          list grows to its content up to 400px and scrolls past
          that, the panel sizes to fit. overscrollBehavior:contain
          keeps wheel events scoped to the dropdown. */}
      <div
        style={{
          overflowY: 'auto',
          maxHeight: 400,
          overscrollBehavior: 'contain',
          padding: 'var(--lp-space-1) var(--lp-space-2) var(--lp-space-1)',
        }}
      >
        {artists.length === 0 ? (
          <EmptyState message="No artists yet." />
        ) : (
          artists.map((a) => (
            <SwitcherArtistRow
              key={a.id}
              artist={a}
              selected={a.id === selectedArtistId}
              onPick={onPick}
              onDeleteArtist={onDeleteArtist}
            />
          ))
        )}
      </div>
      <div
        style={{
          flexShrink: 0,
          padding: 'var(--lp-space-1) var(--lp-space-2) var(--lp-space-2)',
          borderTop: '1px solid var(--lp-border-subtle)',
        }}
      >
        {/* Sprint 8 §5 — "+ Create new artist" CTA mirrors the
            "+ Create new tour" CTA at the bottom of the tours
            pane. Same orange-text + Plus icon styling.
            Sprint 8.5 §2 — pinned outside the scroll area. */}
        <button
          type="button"
          onClick={onCreateArtist}
          className="btn-transition"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--lp-space-2)',
            width: '100%',
            height: 36,
            padding: '0 var(--lp-space-2)',
            borderRadius: 'var(--lp-radius-sm)',
            background: 'transparent',
            color: 'var(--color-lp-orange)',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: 'var(--lp-text-base)',
            fontWeight: 'var(--lp-weight-medium)',
            border: 'none',
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
          Create new artist
        </button>
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
  onDeleteTour,
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
  /** Sprint 8.1 §5 — when defined, each tour row shows a ⋮
   *  overflow menu with a "Delete tour" item. Undefined =
   *  no menu (read-only context). */
  onDeleteTour?: (tour: { id: string; name: string }) => void;
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
      {/* Sprint 8.5 §2 — tour rows scroll independently of the
          create CTA (mirrors the artists pane refactor).
          Sprint 8.6.1 — direct maxHeight: 400 + overflowY:auto +
          overscrollBehavior:contain (see artists pane for full
          rationale). */}
      <div
        style={{
          overflowY: 'auto',
          maxHeight: 400,
          overscrollBehavior: 'contain',
          padding:
            'var(--lp-space-1) var(--lp-space-2) var(--lp-space-1)',
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
              {g.tours.map((t) => (
                <SwitcherTourRow
                  key={t.id}
                  tour={t}
                  selected={t.id === selectedTourId}
                  onPick={onPick}
                  onDeleteTour={onDeleteTour}
                />
              ))}
            </div>
          ))
        )}
      </div>
      <div
        style={{
          flexShrink: 0,
          padding: 'var(--lp-space-1) var(--lp-space-2) var(--lp-space-2)',
          borderTop: '1px solid var(--lp-border-subtle)',
        }}
      >
        {/* "+ Create new tour" CTA — pinned outside the scroll area. */}
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
            padding: '0 var(--lp-space-2)',
            borderRadius: 'var(--lp-radius-sm)',
            background: 'transparent',
            color: 'var(--color-lp-orange)',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: 'var(--lp-text-base)',
            fontWeight: 'var(--lp-weight-medium)',
            border: 'none',
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

/* ============================================
   Sprint 8.1 §5 — <SwitcherTourRow>

   Tour row in the tours pane. Two-element flex layout:
     [── click target (tour name + dates) ──][⋮ menu]

   The click target is a real <button>; the ⋮ menu is a separate
   real <button> via <ContextMenu>. They live as siblings inside
   a flex div so neither is nested inside the other (HTML doesn't
   permit button-in-button) — that's the rationale for the
   refactor away from the original "whole row is a button" shape.

   The outer flex div owns the hover / selected background so the
   highlight covers BOTH the click area and the ⋮ slot, matching
   the visual feedback users had before the refactor. The inner
   button is transparent and inherits.
   ============================================ */

/* ============================================
   Sprint 8.4 §3 — <SwitcherArtistRow>

   Mirrors <SwitcherTourRow>'s flex layout: real <button> for the
   click target alongside a real <button> for the ⋮ menu (HTML
   doesn't allow nested buttons). Outer flex div owns hover/
   selected highlighting so it covers both halves.
   ============================================ */

function SwitcherArtistRow({
  artist,
  selected,
  onPick,
  onDeleteArtist,
}: {
  artist: ArtistMin;
  selected: boolean;
  onPick: (id: string) => void;
  onDeleteArtist?: (artist: { id: string; name: string }) => void;
}) {
  const img = pickArtistImage(artist);
  return (
    <div
      className="btn-transition"
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        height: 36,
        borderRadius: 'var(--lp-radius-sm)',
        background: selected
          ? 'var(--color-lp-orange-subtle-hover)'
          : 'transparent',
        borderLeft: selected
          ? '2px solid var(--color-lp-orange)'
          : '2px solid transparent',
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.background = 'var(--lp-panel-hover)';
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      <button
        type="button"
        onClick={() => onPick(artist.id)}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--lp-space-3)',
          height: '100%',
          padding: '0 var(--lp-space-2)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <ArtistAvatar imageUrl={img} name={artist.name} />
        <span
          className="min-w-0 truncate"
          style={{
            flex: 1,
            fontSize: 'var(--lp-text-base)',
            color: 'var(--lp-text)',
          }}
        >
          {artist.name}
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
      {onDeleteArtist ? (
        <div
          style={{
            paddingRight: 'var(--lp-space-1)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ContextMenu
            items={[
              {
                label: 'Delete artist…',
                icon: Trash2,
                variant: 'danger',
                onClick: () =>
                  onDeleteArtist({ id: artist.id, name: artist.name }),
              },
            ]}
            align="right"
          />
        </div>
      ) : null}
    </div>
  );
}

function SwitcherTourRow({
  tour,
  selected,
  onPick,
  onDeleteTour,
}: {
  tour: TourMin;
  selected: boolean;
  onPick: (id: string) => void;
  onDeleteTour?: (tour: { id: string; name: string }) => void;
}) {
  const range = formatTourDateRange(tour.start_date, tour.end_date);
  return (
    <div
      className="btn-transition"
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        minHeight: 44,
        borderRadius: 'var(--lp-radius-sm)',
        background: selected
          ? 'var(--color-lp-orange-subtle-hover)'
          : 'transparent',
        borderLeft: selected
          ? '2px solid var(--color-lp-orange)'
          : '2px solid transparent',
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.background = 'var(--lp-panel-hover)';
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      <button
        type="button"
        onClick={() => onPick(tour.id)}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 2,
          padding: 'var(--lp-space-2) var(--lp-space-2)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
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
          {tour.name}
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
      {onDeleteTour ? (
        <div
          style={{
            paddingRight: 'var(--lp-space-1)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ContextMenu
            items={[
              {
                label: 'Delete tour',
                icon: Trash2,
                variant: 'danger',
                onClick: () =>
                  onDeleteTour({ id: tour.id, name: tour.name }),
              },
            ]}
            align="right"
          />
        </div>
      ) : null}
    </div>
  );
}

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
