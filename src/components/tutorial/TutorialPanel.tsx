/* ============================================
   LOWPASS — App tour & tutorial panel

   Right-side slide-over mounted once in AppShell (same layer as the
   ⌘K palette / PWA client). All content comes from the tutorial
   registry (src/lib/tutorial/registry.ts) — this component renders
   it blindly.

   Two modes:
   - Tour of the app: numbered read-only steps per section, each with
     a "Show me →" that router.push()es to the REAL page. The panel
     stays open so it reads alongside the live surface — the app is
     the illustration, no screenshots.
   - Tutorial: weekend away: a checkbox build. Progress ("N of M")
     spans every section's tasks.

   Open/close:
   - window CustomEvent 'lp:tutorial-open' (mirrors the rider:*
     CustomEvent seams) — dispatched by the avatar menu entry.
   - Esc / the X close it.
   - Auto-opens ONCE for a user who has never seen it: no
     'lp-tutorial-v1' in localStorage AND pathname === '/artists'
     (the first-login landing) → open after 800ms. Any dismiss
     writes the key, so it never auto-opens again.

   Persistence: mode + last section + done tasks in localStorage
   'lp-tutorial-v1' (this repo persists UI selection in localStorage
   freely — see lp-selected-artist / lp-selected-tour). All window
   access is inside effects or handlers, so SSR never touches it.
   ============================================ */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import {
  TOTAL_TUTORIAL_TASKS,
  TUTORIAL_SECTIONS,
  resolveHref,
  taskKey,
  type TutorialMode,
} from '@/lib/tutorial/registry';

/** Open the panel from anywhere: window.dispatchEvent(new CustomEvent(TUTORIAL_OPEN_EVENT)) */
export const TUTORIAL_OPEN_EVENT = 'lp:tutorial-open';

const STORAGE_KEY = 'lp-tutorial-v1';
/** Written by ArtistTourContext — the last visited tour. */
const SELECTED_TOUR_KEY = 'lp-selected-tour';

interface PersistedState {
  mode: TutorialMode;
  section: string;
  done: string[];
}

/** Resolve the tour id the same way the app does: URL path first
 *  (/operations|advance|budget/[tourId]), then the localStorage
 *  "resume" tour. Handler/effect use only — touches window. */
function currentTourId(pathname: string | null): string | null {
  const m = pathname?.match(/^\/(?:operations|advance|budget)\/([^/?#]+)/);
  if (m?.[1]) return m[1];
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(SELECTED_TOUR_KEY);
  } catch {
    return null;
  }
}

export function TutorialPanel() {
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<TutorialMode>('tour');
  const [sectionIndex, setSectionIndex] = useState(0);
  const [done, setDone] = useState<Record<string, boolean>>({});

  const persist = useCallback(
    (next: {
      mode: TutorialMode;
      sectionIndex: number;
      done: Record<string, boolean>;
    }) => {
      if (typeof window === 'undefined') return;
      const state: PersistedState = {
        mode: next.mode,
        section:
          TUTORIAL_SECTIONS[next.sectionIndex]?.id ?? TUTORIAL_SECTIONS[0].id,
        done: Object.keys(next.done).filter((k) => next.done[k]),
      };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Storage blocked/full — progress just doesn't persist.
      }
    },
    [],
  );

  /* Hydrate saved progress once on mount. State is set a tick later
     (queueMicrotask) — the repo's pattern for effect-driven state under
     react-hooks/set-state-in-effect. */
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (raw === null) return;
    let saved: Partial<PersistedState>;
    try {
      saved = JSON.parse(raw) as Partial<PersistedState>;
    } catch {
      return; // corrupt state — start fresh
    }
    if (!saved || typeof saved !== 'object') return;
    queueMicrotask(() => {
      if (saved.mode === 'tour' || saved.mode === 'tutorial') {
        setMode(saved.mode);
      }
      if (typeof saved.section === 'string') {
        const i = TUTORIAL_SECTIONS.findIndex((s) => s.id === saved.section);
        if (i >= 0) setSectionIndex(i);
      }
      if (Array.isArray(saved.done)) {
        const map: Record<string, boolean> = {};
        for (const k of saved.done) {
          if (typeof k === 'string') map[k] = true;
        }
        setDone(map);
      }
    });
  }, []);

  /* First-login auto-open: never-seen user landing on /artists.
     Checked at most once per app load; dismissing writes the key. */
  const autoOpenChecked = useRef(false);
  useEffect(() => {
    if (autoOpenChecked.current) return;
    if (pathname !== '/artists') return;
    autoOpenChecked.current = true;
    let seen = true;
    try {
      seen = window.localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      // storage unreadable — treat as seen, never auto-open
    }
    if (seen) return;
    const t = window.setTimeout(() => setOpen(true), 800);
    return () => window.clearTimeout(t);
  }, [pathname]);

  /* Open on the global CustomEvent (avatar menu → App tour & tutorial). */
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(TUTORIAL_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(TUTORIAL_OPEN_EVENT, onOpen);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    // Writing the key on any dismiss is what disarms the auto-open.
    persist({ mode, sectionIndex, done });
  }, [mode, sectionIndex, done, persist]);

  /* Esc closes (keyboard contract: an open overlay always has a way out). */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  const handleMode = (m: TutorialMode) => {
    setMode(m);
    persist({ mode: m, sectionIndex, done });
  };

  const gotoSection = (i: number) => {
    const clamped = Math.max(0, Math.min(TUTORIAL_SECTIONS.length - 1, i));
    setSectionIndex(clamped);
    persist({ mode, sectionIndex: clamped, done });
  };

  const toggleTask = (key: string) => {
    const next = { ...done, [key]: !done[key] };
    setDone(next);
    persist({ mode, sectionIndex, done: next });
  };

  /* "Show me →" — navigate to the real page. The panel stays open so
     the step reads alongside the live surface. */
  const showMe = (href: string) => {
    router.push(resolveHref(href, currentTourId(pathname)));
  };

  if (!open) return null;

  const section = TUTORIAL_SECTIONS[sectionIndex];
  const doneCount = TUTORIAL_SECTIONS.reduce(
    (n, s) =>
      n + s.tutorialTasks.filter((_, i) => done[taskKey(s.id, i)]).length,
    0,
  );
  const allDone = doneCount === TOTAL_TUTORIAL_TASKS;
  const isFirst = sectionIndex === 0;
  const isLast = sectionIndex === TUTORIAL_SECTIONS.length - 1;
  const counter = `${String(sectionIndex + 1).padStart(2, '0')} / ${String(TUTORIAL_SECTIONS.length).padStart(2, '0')}`;

  const sectionDone = (s: (typeof TUTORIAL_SECTIONS)[number]) =>
    s.tutorialTasks.length > 0 &&
    s.tutorialTasks.every((_, i) => done[taskKey(s.id, i)]);

  return (
    <aside
      role="dialog"
      aria-label="App tour and tutorial"
      className="fixed inset-y-0 right-0 z-50 flex flex-col"
      style={{
        width: 420,
        maxWidth: '100vw',
        background: 'var(--lp-surface)',
        borderLeft: '1px solid var(--lp-border-strong)',
        boxShadow: 'var(--lp-shadow-overlay)',
      }}
    >
      {/* Header */}
      <div
        className="flex shrink-0 items-center gap-2 px-4"
        style={{ height: 52, borderBottom: '1px solid var(--lp-border)' }}
      >
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: 'var(--lp-radius-xs)',
            background: 'var(--lp-orange)',
          }}
        />
        <span
          className="lp-mono"
          style={{
            fontSize: 'var(--lp-text-2xs)',
            fontWeight: 'var(--lp-weight-semibold)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--lp-text)',
          }}
        >
          App tour &amp; tutorial
        </span>
        <span
          className="lp-mono ml-auto"
          style={{
            fontSize: 'var(--lp-text-2xs)',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          Esc closes
        </span>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close tutorial"
          className="btn-transition flex shrink-0 items-center justify-center rounded-md border"
          style={{
            width: 26,
            height: 26,
            borderColor: 'var(--lp-border)',
            background: 'transparent',
            color: 'var(--lp-text-secondary)',
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Mode toggle */}
      <div
        className="flex shrink-0 items-center gap-1.5 px-4 py-2.5"
        style={{ borderBottom: '1px solid var(--lp-border)' }}
      >
        {(
          [
            ['tour', 'Tour of the app'],
            ['tutorial', 'Tutorial: weekend away'],
          ] as const
        ).map(([m, label]) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => handleMode(m)}
              className="btn-transition rounded-full border px-3 py-1.5"
              style={{
                fontSize: 'var(--lp-text-2xs)',
                fontWeight: 'var(--lp-weight-semibold)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                borderColor: active ? 'var(--lp-orange)' : 'var(--lp-border)',
                background: active ? 'var(--lp-orange)' : 'transparent',
                color: active ? '#fff' : 'var(--lp-text-secondary)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Section tabs */}
        <nav
          aria-label="Tutorial sections"
          className="shrink-0 overflow-y-auto py-2"
          style={{
            width: 118,
            borderRight: '1px solid var(--lp-border)',
            background: 'var(--lp-bg-secondary)',
          }}
        >
          {TUTORIAL_SECTIONS.map((s, i) => {
            const active = i === sectionIndex;
            const complete = mode === 'tutorial' && sectionDone(s);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => gotoSection(i)}
                aria-current={active ? 'true' : undefined}
                className="btn-transition block w-full text-left"
                style={{
                  padding: '7px 8px 7px 10px',
                  fontSize: 'var(--lp-text-2xs)',
                  fontWeight: active
                    ? 'var(--lp-weight-semibold)'
                    : 'var(--lp-weight-medium)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: active ? 'var(--lp-text)' : 'var(--lp-text-tertiary)',
                  borderLeft: active
                    ? '2px solid var(--lp-orange)'
                    : '2px solid transparent',
                  background: active ? '#FF450014' : 'transparent',
                }}
              >
                {s.label}
                {complete ? (
                  <span aria-label="section complete" style={{ color: 'var(--lp-green)' }}>
                    {' '}
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-4 py-4">
          <div
            className="lp-mono"
            style={{
              fontSize: '10px',
              fontWeight: 'var(--lp-weight-semibold)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--lp-orange)',
            }}
          >
            {mode === 'tour' ? 'Tour of the app' : 'Tutorial · weekend away'}
            {' · '}
            {counter}
          </div>
          <h2
            style={{
              marginTop: 6,
              fontSize: 'var(--lp-text-lg)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-text)',
            }}
          >
            {section.label}
          </h2>

          {mode === 'tour' ? (
            <ol className="mt-3 flex flex-col gap-2">
              {section.tourSteps.map((step, i) => {
                const href = step.href;
                return (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-lg border p-3"
                    style={{
                      borderColor: 'var(--lp-border)',
                      background: 'var(--lp-bg-secondary)',
                    }}
                  >
                    <span
                      className="lp-mono shrink-0"
                      style={{
                        fontSize: '11px',
                        fontWeight: 'var(--lp-weight-semibold)',
                        color: 'var(--lp-orange)',
                        paddingTop: 1,
                      }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        style={{
                          display: 'block',
                          fontSize: 'var(--lp-text-sm)',
                          color: 'var(--lp-text)',
                          lineHeight: 'var(--lp-leading-normal)',
                        }}
                      >
                        {step.text}
                      </span>
                      {href ? (
                        <button
                          type="button"
                          onClick={() => showMe(href)}
                          className="btn-transition mt-1"
                          style={{
                            padding: 0,
                            border: 0,
                            background: 'none',
                            fontSize: 'var(--lp-text-xs)',
                            fontWeight: 'var(--lp-weight-semibold)',
                            color: 'var(--lp-orange)',
                            cursor: 'pointer',
                          }}
                        >
                          Show me →
                        </button>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <>
              {/* Progress across ALL sections' tasks */}
              <div className="mt-3 flex items-center gap-2.5">
                <span
                  className="lp-mono shrink-0"
                  style={{
                    fontSize: 'var(--lp-text-2xs)',
                    color: 'var(--lp-text-secondary)',
                  }}
                >
                  {doneCount} of {TOTAL_TUTORIAL_TASKS}
                </span>
                <div
                  className="min-w-0 flex-1 overflow-hidden rounded-full"
                  style={{ height: 5, background: 'var(--lp-bg-tertiary)' }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${TOTAL_TUTORIAL_TASKS ? Math.round((doneCount / TOTAL_TUTORIAL_TASKS) * 100) : 0}%`,
                      background: 'var(--lp-orange)',
                      borderRadius: 'var(--lp-radius-full)',
                      transition:
                        'width var(--lp-duration-base) var(--lp-ease-out)',
                    }}
                  />
                </div>
              </div>

              {allDone ? (
                <div
                  className="mt-3 rounded-md border px-3 py-2"
                  style={{
                    borderColor: 'var(--lp-green)',
                    background: '#10B98114',
                    fontSize: 'var(--lp-text-xs)',
                    color: 'var(--lp-green)',
                  }}
                >
                  Done. Weekend Away is built.
                </div>
              ) : null}

              <div className="mt-3 flex flex-col gap-2">
                {section.tutorialTasks.map((task, i) => {
                  const key = taskKey(section.id, i);
                  const checked = !!done[key];
                  const href = task.href;
                  return (
                    <label
                      key={key}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
                      style={{
                        borderColor: 'var(--lp-border)',
                        background: 'var(--lp-bg-secondary)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTask(key)}
                        className="mt-0.5 shrink-0"
                        style={{ accentColor: 'var(--lp-orange)' }}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          style={{
                            display: 'block',
                            fontSize: 'var(--lp-text-sm)',
                            color: checked
                              ? 'var(--lp-text-tertiary)'
                              : 'var(--lp-text)',
                            textDecoration: checked ? 'line-through' : 'none',
                            lineHeight: 'var(--lp-leading-normal)',
                          }}
                        >
                          {task.text}
                        </span>
                        {href ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault(); // don't toggle the checkbox
                              showMe(href);
                            }}
                            className="btn-transition mt-1"
                            style={{
                              padding: 0,
                              border: 0,
                              background: 'none',
                              fontSize: 'var(--lp-text-xs)',
                              fontWeight: 'var(--lp-weight-semibold)',
                              color: 'var(--lp-orange)',
                              cursor: 'pointer',
                            }}
                          >
                            Show me →
                          </button>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          )}

          {/* Back / Next */}
          <div className="mt-auto flex shrink-0 items-center gap-2 pt-4">
            <button
              type="button"
              disabled={isFirst}
              onClick={() => gotoSection(sectionIndex - 1)}
              className="btn-transition rounded-md border px-3.5 py-1.5"
              style={{
                fontSize: 'var(--lp-text-xs)',
                fontWeight: 'var(--lp-weight-semibold)',
                borderColor: 'var(--lp-border)',
                background: 'transparent',
                color: 'var(--lp-text-secondary)',
                opacity: isFirst ? 0.4 : 1,
                cursor: isFirst ? 'default' : 'pointer',
              }}
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={isLast}
              onClick={() => gotoSection(sectionIndex + 1)}
              className="btn-transition rounded-md border px-3.5 py-1.5"
              style={{
                fontSize: 'var(--lp-text-xs)',
                fontWeight: 'var(--lp-weight-semibold)',
                borderColor: 'var(--lp-orange)',
                background: 'var(--lp-orange)',
                color: '#fff',
                opacity: isLast ? 0.4 : 1,
                cursor: isLast ? 'default' : 'pointer',
              }}
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
