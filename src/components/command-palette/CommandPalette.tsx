'use client';

/* ============================================
   LOWPASS — CommandPalette (UX08b)

   Spotlight-style cross-entity search popover.

   - ⌘K toggles globally (listener mounted in AppShell)
   - Empty query → recent items from localStorage
   - Typed query → debounced (150ms) fan-out via searchAll()
   - Keyboard nav: ↑/↓ moves selection, Enter activates, Esc closes
   - Mouse hover sets selection; click activates
   - Active row uses --lp-orange-subtle bg + 2px --lp-orange left border
   - z-index --lp-z-command-palette (1500), backdrop --lp-z-modal-backdrop

   The outer <CommandPalette> mounts/unmounts the inner <PaletteInner>
   based on the `open` flag. The inner component therefore initialises
   fresh state every time the palette is opened — no useEffect needed
   to "reset" anything (which would trip react-hooks/set-state-in-effect).
   ============================================ */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Plane,
  User as UserIcon,
  BedDouble,
  Speaker,
  Music,
  Briefcase,
  FileSignature,
  Receipt,
  Bug,
  BookOpen,
  Wrench,
  Search as SearchIcon,
  X as CloseIcon,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEntityRouting } from '@/components/entity/EntityRoutingContext';
import { useSuggestionsPreference } from '@/components/detail-panel/useSuggestionsPreference';
import { askHistory, looksLikeQuestion, type AskResult } from '@/lib/search/ask';
import {
  clearRecent,
  loadRecent,
  pushRecent,
  searchAll,
  type RecentItem,
  type SearchKind,
  type SearchResult,
} from '@/lib/search/providers';
import { useCommandPalette } from './CommandPaletteContext';

const KIND_LABEL: Record<SearchKind, string> = {
  show: 'Shows',
  person: 'People',
  flight: 'Flights',
  room: 'Rooms',
  gear: 'Gear',
  'deal-memo': 'Deal memos',
  tour: 'Tours',
  'budget-line': 'Budget lines',
  'bug-report': 'Bug reports',
  'rider-pack': 'Rider packs',
  'rental-job': 'Rental jobs',
  receipt: 'Receipts',
};

const KIND_ICON: Record<SearchKind, typeof UserIcon> = {
  show: Music,
  person: UserIcon,
  flight: Plane,
  room: BedDouble,
  gear: Speaker,
  'deal-memo': FileSignature,
  tour: Briefcase,
  'budget-line': Receipt,
  'bug-report': Bug,
  'rider-pack': BookOpen,
  'rental-job': Wrench,
  receipt: Receipt,
};

const GROUP_ORDER: SearchKind[] = [
  'show',
  'tour',
  'person',
  'flight',
  'room',
  'gear',
  'deal-memo',
  'rider-pack',
  'rental-job',
  'budget-line',
  'bug-report',
];

type Selectable =
  | { kind: 'result'; result: SearchResult }
  | { kind: 'recent'; recent: RecentItem };

function HighlightedLabel({
  label,
  ranges,
}: {
  label: string;
  ranges: Array<[number, number]>;
}) {
  if (!ranges.length) return <>{label}</>;
  const out: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (cursor < start) out.push(<span key={`p${i}`}>{label.slice(cursor, start)}</span>);
    out.push(
      <mark
        key={`m${i}`}
        className="bg-transparent font-semibold"
        style={{ color: 'var(--color-lp-orange)' }}
      >
        {label.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < label.length) out.push(<span key="tail">{label.slice(cursor)}</span>);
  return <>{out}</>;
}

function ResultRow({
  selectable,
  active,
  onActivate,
  onHover,
}: {
  selectable: Selectable;
  active: boolean;
  onActivate: () => void;
  onHover: () => void;
}) {
  const isResult = selectable.kind === 'result';
  const data = isResult
    ? {
        kind: selectable.result.kind,
        label: selectable.result.label,
        secondary: selectable.result.secondary,
        ranges: selectable.result.ranges,
      }
    : {
        kind: selectable.recent.kind,
        label: selectable.recent.label,
        secondary: selectable.recent.secondary,
        ranges: [] as Array<[number, number]>,
      };
  const Icon = KIND_ICON[data.kind] ?? SearchIcon;

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onClick={onActivate}
      className="flex w-full items-center gap-3 px-3 py-2 text-left"
      style={{
        background: active
          ? 'color-mix(in srgb, var(--color-lp-orange) 7%, transparent)'
          : 'transparent',
        borderLeft: active
          ? '2px solid var(--color-lp-orange)'
          : '2px solid transparent',
        color: 'var(--lp-text)',
      }}
    >
      <Icon className="h-4 w-4 shrink-0" style={{ color: 'var(--lp-text-tertiary)' }} />
      <span className="min-w-0 flex-1 truncate text-sm">
        <HighlightedLabel label={data.label} ranges={data.ranges} />
      </span>
      {data.secondary ? (
        <span
          className="shrink-0 truncate text-right text-xs"
          style={{ color: 'var(--lp-text-tertiary)' }}
        >
          {data.secondary}
        </span>
      ) : null}
    </button>
  );
}

function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-3 pb-1 pt-3 text-xs font-semibold uppercase"
      style={{
        color: 'var(--lp-text-tertiary)',
        letterSpacing: 'var(--lp-tracking-caps, 0.08em)',
        fontSize: 'var(--lp-text-2xs, 10px)',
      }}
    >
      {children}
    </div>
  );
}

/**
 * Inner palette body. Re-mounted via key whenever the outer palette
 * opens, so initial state is always fresh — no reset effect required.
 */
function PaletteInner({
  hide,
  userId,
}: {
  hide: () => void;
  userId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const entityRouting = useEntityRouting();

  // Route context for the Ask scope: a tour (operations/budget/advance) or
  // an artist. Lets "ask your history" default to what you're looking at.
  const ctxTourId = useMemo(() => {
    const m = pathname?.match(/^\/(?:operations|budget|advance)\/([^/]+)/);
    return m ? m[1] : null;
  }, [pathname]);
  const ctxArtistId = useMemo(() => {
    const m = pathname?.match(/^\/artists\/([^/]+)/);
    return m ? m[1] : null;
  }, [pathname]);
  const hasScopeContext = Boolean(ctxTourId || ctxArtistId);
  const scopeLabel = ctxTourId ? 'This tour' : ctxArtistId ? 'This artist' : '';
  const [scopeMode, setScopeMode] = useState<'context' | 'workspace'>('context');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Snapshot recents at mount (re-snapshot when user clears via the button).
  const [recent, setRecent] = useState<RecentItem[]>(() => loadRecent(userId));

  // RAG "ask your history" — gated by the build-#1 opt-in preference.
  const { enabled: askEnabled } = useSuggestionsPreference();
  const [ask, setAsk] = useState<{ query: string; loading: boolean; result: AskResult | null }>({
    query: '',
    loading: false,
    result: null,
  });
  const runAsk = useCallback(
    (q: string) => {
      const scope =
        scopeMode === 'context' && ctxTourId
          ? { tourId: ctxTourId }
          : scopeMode === 'context' && ctxArtistId
            ? { artistId: ctxArtistId }
            : undefined;
      setAsk({ query: q, loading: true, result: null });
      void askHistory(q, scope).then((result) => {
        // Ignore a stale answer if the user has since changed the query.
        setAsk((prev) => (prev.query === q ? { query: q, loading: false, result } : prev));
      });
    },
    [scopeMode, ctxTourId, ctxArtistId],
  );
  // Flipping scope invalidates any shown answer so the user re-asks deliberately.
  const toggleScope = useCallback(() => {
    setScopeMode((m) => (m === 'context' ? 'workspace' : 'context'));
    setAsk({ query: '', loading: false, result: null });
  }, []);

  // useDeferredValue lets React's scheduler defer search-firing during
  // bursts of typing without us needing to manage a setTimeout / setState
  // pair (which would trip the strict react-hooks/set-state-in-effect rule).
  const debounced = useDeferredValue(query);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Autofocus on mount only (effect body doesn't setState).
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(id);
  }, []);

  // Run search when debounced query changes. The setState calls live in
  // the .then/.catch/.finally microtask handlers, not the effect body —
  // the strict lint rule accepts that.
  useEffect(() => {
    const q = debounced.trim();
    if (!q) {
      return undefined;
    }
    let cancelled = false;
    void searchAll(q, { limit: 50 })
      .then((r) => {
        if (cancelled) return;
        setResults(r);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setResults([]);
        setLoading(false);
      });
    // Mark loading via a microtask too so we never call setState in the
    // effect body itself.
    queueMicrotask(() => {
      if (!cancelled) setLoading(true);
    });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const flatList = useMemo<Selectable[]>(() => {
    if (debounced.trim()) {
      const out: Selectable[] = [];
      const byKind = new Map<SearchKind, SearchResult[]>();
      for (const r of results) {
        const arr = byKind.get(r.kind) ?? [];
        arr.push(r);
        byKind.set(r.kind, arr);
      }
      for (const k of GROUP_ORDER) {
        const list = byKind.get(k);
        if (!list || list.length === 0) continue;
        for (const r of list) out.push({ kind: 'result', result: r });
      }
      return out;
    }
    return recent.map<Selectable>((r) => ({ kind: 'recent', recent: r }));
  }, [debounced, results, recent]);

  // Clamp the rendered selection to the current list size; the underlying
  // state is allowed to drift past the list end without resetting (avoids
  // a setState-in-effect on flatList.length change).
  const renderedIndex = Math.min(selectedIndex, Math.max(0, flatList.length - 1));

  // Scroll the rendered selection into view when it changes.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-row-index="${renderedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [renderedIndex]);

  const activate = useCallback(
    (selectable: Selectable) => {
      const action = selectable.kind === 'result' ? selectable.result.action : selectable.recent.action;
      const baseRecent =
        selectable.kind === 'result'
          ? {
              id: selectable.result.id,
              kind: selectable.result.kind,
              label: selectable.result.label,
              secondary: selectable.result.secondary,
              action: selectable.result.action,
            }
          : {
              id: selectable.recent.id,
              kind: selectable.recent.kind,
              label: selectable.recent.label,
              secondary: selectable.recent.secondary,
              action: selectable.recent.action,
            };
      pushRecent(userId, baseRecent);
      hide();
      if (action.type === 'open-entity') {
        entityRouting.open({ kind: action.kind, id: action.id });
      } else {
        router.push(action.href);
      }
    },
    [hide, entityRouting, router, userId],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) =>
          Math.min(Math.min(i, Math.max(0, flatList.length - 1)) + 1, Math.max(0, flatList.length - 1)),
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, Math.min(i, flatList.length - 1) - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const sel = flatList[renderedIndex];
        if (sel) activate(sel);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hide();
      }
    },
    [flatList, renderedIndex, activate, hide],
  );

  const groupBoundaries = new Map<number, SearchKind>();
  if (debounced.trim()) {
    let prevKind: SearchKind | null = null;
    flatList.forEach((sel, idx) => {
      if (sel.kind !== 'result') return;
      if (sel.result.kind !== prevKind) {
        groupBoundaries.set(idx, sel.result.kind);
        prevKind = sel.result.kind;
      }
    });
  }

  const empty = flatList.length === 0;
  const curQ = debounced.trim();
  // The Ask affordance shows only when the opt-in is on AND the query reads
  // like a question (build-#1 gate → non-invasive).
  const showAsk = askEnabled && looksLikeQuestion(curQ);
  const askForCurrent = ask.query === curQ ? ask : null;

  return (
    <div
      role="dialog"
      aria-label="Command palette"
      aria-modal="true"
      onKeyDown={handleKeyDown}
      className="fixed inset-0 flex items-start justify-center"
      style={{
        zIndex: 'var(--lp-z-command-palette, 1500)',
        background: 'color-mix(in srgb, #000 50%, transparent)',
        animationDuration: 'var(--lp-duration-slow, 240ms)',
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) hide();
      }}
    >
      <div
        className="mt-[15vh] w-full max-w-[640px] overflow-hidden rounded-xl border shadow-xl"
        style={{
          maxHeight: '480px',
          background: 'var(--lp-surface)',
          borderColor: 'var(--lp-border)',
          boxShadow: 'var(--lp-shadow-xl, 0 24px 48px rgba(0,0,0,0.25))',
          borderRadius: 'var(--lp-radius-xl, 12px)',
        }}
      >
        <div
          className="flex items-center gap-2 border-b px-3"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <SearchIcon className="h-4 w-4 shrink-0" style={{ color: 'var(--lp-text-tertiary)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shows, people, flights…"
            className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none"
            style={{ color: 'var(--lp-text)' }}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={hide}
            className="rounded-md p-1"
            style={{ color: 'var(--lp-text-tertiary)' }}
            aria-label="Close palette"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div ref={listRef} className="max-h-[380px] overflow-y-auto py-1" role="listbox">
          {showAsk ? (
            <div className="border-b px-3 py-2" style={{ borderColor: 'var(--lp-border)' }}>
              {hasScopeContext ? (
                <div className="mb-1 flex items-center justify-end gap-1 px-2 text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
                  <span>Scope:</span>
                  <button
                    type="button"
                    onClick={toggleScope}
                    className="rounded px-1.5 py-0.5 font-medium"
                    style={{
                      color: 'var(--color-lp-orange)',
                      background: 'color-mix(in srgb, var(--color-lp-orange) 8%, transparent)',
                    }}
                  >
                    {scopeMode === 'context' ? scopeLabel : 'Whole workspace'} ▾
                  </button>
                </div>
              ) : null}
              {!askForCurrent || (!askForCurrent.loading && !askForCurrent.result) ? (
                <button
                  type="button"
                  onClick={() => runAsk(curQ)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm"
                  style={{ color: 'var(--lp-text)' }}
                >
                  <Sparkles className="h-4 w-4 shrink-0" style={{ color: 'var(--color-lp-orange)' }} />
                  <span className="min-w-0 flex-1 truncate">
                    Ask your history: «{curQ}»
                  </span>
                </button>
              ) : askForCurrent.loading ? (
                <div className="flex items-center gap-2 px-2 py-2 text-sm" style={{ color: 'var(--lp-text-tertiary)' }}>
                  <Sparkles className="h-4 w-4 shrink-0 animate-pulse" style={{ color: 'var(--color-lp-orange)' }} />
                  Searching your history…
                </div>
              ) : askForCurrent.result ? (
                <div className="space-y-2 px-2 py-2">
                  {askForCurrent.result.error ? (
                    <p className="text-sm" style={{ color: 'var(--lp-text-tertiary)' }}>
                      {askForCurrent.result.error}
                    </p>
                  ) : (
                    <>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--lp-text)' }}>
                        {askForCurrent.result.answer}
                      </p>
                      {askForCurrent.result.sources.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {askForCurrent.result.sources.map((s) => (
                            <span
                              key={`${s.source_kind}-${s.source_id}`}
                              className="inline-flex max-w-full items-center gap-1 truncate rounded-md px-2 py-0.5 text-xs"
                              title={s.snippet}
                              style={{
                                background: 'color-mix(in srgb, var(--color-lp-orange) 8%, transparent)',
                                color: 'var(--lp-text-secondary)',
                              }}
                            >
                              {s.source_kind.replace(/_/g, ' ')}
                              {s.city ? ` · ${s.city}` : ''}
                              {s.date ? ` · ${s.date}` : ''}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {empty && debounced.trim() && !loading && !showAsk ? (
            <div className="px-4 py-12 text-center text-sm" style={{ color: 'var(--lp-text-tertiary)' }}>
              No matches for «{debounced.trim()}»
            </div>
          ) : null}

          {empty && !debounced.trim() && !loading ? (
            <div className="px-4 py-12 text-center text-sm" style={{ color: 'var(--lp-text-tertiary)' }}>
              Type to search across shows, people, flights, gear, tours…
            </div>
          ) : null}

          {loading && empty ? (
            <div className="space-y-2 px-3 py-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-7 w-full animate-pulse rounded"
                  style={{ background: 'var(--lp-bg-tertiary)' }}
                />
              ))}
            </div>
          ) : null}

          {!debounced.trim() && recent.length > 0 ? (
            <>
              <GroupHeader>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3 w-3" /> Recent
                </span>
              </GroupHeader>
              {recent.map((r, idx) => (
                <div key={`recent-${r.kind}-${r.id}`} data-row-index={idx}>
                  <ResultRow
                    selectable={{ kind: 'recent', recent: r }}
                    active={renderedIndex === idx}
                    onActivate={() => activate({ kind: 'recent', recent: r })}
                    onHover={() => setSelectedIndex(idx)}
                  />
                </div>
              ))}
              <div className="flex justify-end px-3 py-2">
                <button
                  type="button"
                  onClick={() => {
                    clearRecent(userId);
                    setRecent([]);
                  }}
                  className="text-xs"
                  style={{ color: 'var(--lp-text-tertiary)' }}
                >
                  Clear recent
                </button>
              </div>
            </>
          ) : null}

          {debounced.trim() && flatList.length > 0
            ? flatList.map((sel, idx) => {
                const group = groupBoundaries.get(idx);
                return (
                  <div
                    key={`${sel.kind === 'result' ? sel.result.kind : 'r'}-${sel.kind === 'result' ? sel.result.id : sel.recent.id}-${idx}`}
                  >
                    {group ? <GroupHeader>{KIND_LABEL[group]}</GroupHeader> : null}
                    <div data-row-index={idx}>
                      <ResultRow
                        selectable={sel}
                        active={renderedIndex === idx}
                        onActivate={() => activate(sel)}
                        onHover={() => setSelectedIndex(idx)}
                      />
                    </div>
                  </div>
                );
              })
            : null}
        </div>

        <div
          className="flex items-center justify-between border-t px-3 py-2 text-xs"
          style={{
            borderColor: 'var(--lp-border)',
            color: 'var(--lp-text-tertiary)',
            background: 'var(--lp-bg-secondary)',
          }}
        >
          <span>
            <kbd>↑↓</kbd> navigate · <kbd>↵</kbd> open · <kbd>esc</kbd> close
          </span>
          <span>
            {flatList.length > 0
              ? `${flatList.length} result${flatList.length === 1 ? '' : 's'}`
              : null}
          </span>
        </div>
      </div>
    </div>
  );
}

export function CommandPalette() {
  const { open, hide } = useCommandPalette();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  if (!open) return null;

  // Key by the userId so a sign-out + sign-in remounts cleanly. The outer
  // mount/unmount on `open` is the primary reset mechanism.
  return <PaletteInner key={userId ?? 'anon'} hide={hide} userId={userId} />;
}
