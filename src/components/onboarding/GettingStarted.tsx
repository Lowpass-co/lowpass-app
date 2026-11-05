'use client';

/* ============================================
   LOWPASS — Getting started (Nov 2026, Adam) — replaces the old
   "App tour & tutorial" side panel.

   Mounted once in AppShell (inside TourEditorProvider, so it can open the
   tour window). Two pieces:
     - <WelcomeDeck>: four cards. Opens by itself once for someone new
       (shouldAutoWelcome); reopened from the avatar menu → Getting started.
     - <SetupChecklist>: six steps that tick themselves from
       GET /api/onboarding/status, for admins and managers.

   The facts come from the server; only "seen the welcome / hid or folded the
   checklist" lives in this browser (localStorage 'lp-onboarding-v2', all
   access in effects/handlers inside try/catch). Status is re-read when the
   page changes or the window regains focus, at most every few seconds.
   ============================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTourEditor } from '@/contexts/TourEditorContext';
import { ArtistCreateSlideOver } from '@/components/shell-v2/ArtistCreateSlideOver';
import {
  checklistFor,
  parseLocal,
  shouldAutoWelcome,
  shouldShowChecklist,
  EMPTY_LOCAL,
  type ChecklistItem,
  type LocalOnboarding,
  type OnboardingStatus,
} from '@/lib/onboarding/checklist';
import { WelcomeDeck } from './WelcomeDeck';
import { SetupChecklist } from './SetupChecklist';

/** Open the welcome from anywhere: window.dispatchEvent(new CustomEvent(ONBOARDING_OPEN_EVENT)) */
export const ONBOARDING_OPEN_EVENT = 'lp:onboarding-open';

const STORAGE_KEY = 'lp-onboarding-v2';
/** The retired panel's key — anyone who has it is not new. */
const LEGACY_KEY = 'lp-tutorial-v1';
const REFRESH_MIN_MS = 4000;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function GettingStarted() {
  const router = useRouter();
  const pathname = usePathname();
  const { openCreateTour } = useTourEditor();

  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [local, setLocal] = useState<LocalOnboarding>(EMPTY_LOCAL);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [artistOpen, setArtistOpen] = useState(false);
  /** Browser state has been read (until then nothing is decided). */
  const [ready, setReady] = useState(false);
  /** Saw the retired panel — not new, never auto-welcomed. */
  const [legacy, setLegacy] = useState(false);
  /** The once-per-load auto-welcome decision has been made. */
  const [autoDecided, setAutoDecided] = useState(false);
  const lastFetch = useRef(0);

  const save = useCallback((next: LocalOnboarding) => {
    setLocal(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage blocked — it just won't be remembered.
    }
  }, []);

  const refresh = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastFetch.current < REFRESH_MIN_MS) return;
    lastFetch.current = now;
    fetch('/api/onboarding/status', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<OnboardingStatus>) : null))
      .then((s) => { if (s && s.done) setStatus(s); })
      .catch(() => { /* No status, no checklist — the app works without it. */ });
  }, []);

  // Browser state, once.
  useEffect(() => {
    const sawOld = readStorage(LEGACY_KEY) !== null;
    const stored = parseLocal(readStorage(STORAGE_KEY));
    queueMicrotask(() => {
      setLegacy(sawOld);
      setLocal(stored);
      setReady(true);
    });
  }, []);

  /* Ask the server only while something could show: the welcome is open, the
     auto-welcome is still undecided, or the checklist is on for someone who
     can set up. Everyone else (most sessions) makes no request at all. */
  const wantsStatus =
    ready &&
    (welcomeOpen ||
      (!local.welcomed && !legacy && !autoDecided) ||
      (local.welcomed && !local.checklistHidden && (status?.canSetUp ?? true)));

  // Facts: on load, on each page, and when the window comes back.
  useEffect(() => { if (wantsStatus) refresh(); }, [pathname, wantsStatus, refresh]);
  useEffect(() => {
    if (!wantsStatus) return;
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [wantsStatus, refresh]);

  // The welcome opens by itself at most once per load, for someone new.
  useEffect(() => {
    if (!status || autoDecided) return;
    const open = shouldAutoWelcome(status, local, legacy);
    const t = window.setTimeout(() => {
      setAutoDecided(true);
      if (open) setWelcomeOpen(true);
    }, open ? 600 : 0);
    return () => window.clearTimeout(t);
  }, [status, autoDecided, local, legacy]);

  // Avatar menu → Getting started.
  useEffect(() => {
    const onOpen = () => {
      setWelcomeOpen(true);
      refresh(true);
    };
    window.addEventListener(ONBOARDING_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ONBOARDING_OPEN_EVENT, onOpen);
  }, [refresh]);

  const finishWelcome = useCallback(() => {
    setWelcomeOpen(false);
    // Finishing (or skipping) the welcome brings the checklist back, unfolded.
    save({ welcomed: true, checklistHidden: false, collapsed: false });
  }, [save]);

  const act = (item: ChecklistItem) => {
    const a = item.action;
    if (a.kind === 'create-artist') setArtistOpen(true);
    else if (a.kind === 'create-tour') openCreateTour({ artistId: a.artistId });
    else {
      // Fold to the pill so the page it opens is in view.
      save({ ...local, collapsed: true });
      router.push(a.href);
    }
  };

  const showChecklist = !!status && !welcomeOpen && shouldShowChecklist(status, local);

  return (
    <>
      <WelcomeDeck open={welcomeOpen} canSetUp={!!status?.canSetUp} onDone={finishWelcome} />
      {showChecklist ? (
        <SetupChecklist
          items={checklistFor(status)}
          collapsed={local.collapsed}
          onCollapse={(collapsed) => save({ ...local, collapsed })}
          onHide={() => save({ ...local, checklistHidden: true })}
          onAction={act}
        />
      ) : null}
      <ArtistCreateSlideOver
        open={artistOpen}
        onClose={() => setArtistOpen(false)}
        onCreated={(artist) => {
          setArtistOpen(false);
          refresh(true);
          router.push(`/artists/${artist.id}`);
        }}
      />
    </>
  );
}
