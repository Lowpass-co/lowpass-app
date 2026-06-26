'use client';

/* ============================================
   LOWPASS — <ConnectionIndicator> (Sprint 9 §13.A.14)

   4-state status pill for ProductHeader. Surfaces network /
   save state without taking a toast slot — Adam's spec calls
   for persistent visibility, not transient nudges.

   States (priority high → low):
     - Save failed   — red,    "Save failed — last edit not stored"
     - Offline       — red,    "Offline — refresh to reconnect"
     - Connecting    — amber,  "Connecting…"
     - Live          — green,  "Live"

   Data sources:
     - navigator.onLine + window 'online'/'offline' events drive
       Offline/Live.
     - Connecting is a brief amber bridge during the first 600ms
       after coming back online (prevents Live → Offline → Live
       flicker on transient disconnects).
     - Save failed is dispatched by callers via
       reportSaveFailure(message). Stays sticky until cleared
       via clearSaveFailure() OR a successful save reports in
       via reportSaveSuccess().

   The provider lives in <AppShell> so any component can call
   the dispatchers; the indicator can mount anywhere (currently
   ProductHeader).

   Save-failed plumbing is intentionally lightweight: callers
   wrap their fetch error handlers in a one-liner. As Sprint 10+
   lands a global fetch wrapper or error boundary, this can be
   centralised.
   ============================================ */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type ConnectionState = 'live' | 'connecting' | 'offline' | 'save_failed';

interface SaveFailure {
  at: number;
  message: string;
}

interface ConnectionStatusValue {
  state: ConnectionState;
  saveFailure: SaveFailure | null;
  reportSaveFailure: (message: string) => void;
  reportSaveSuccess: () => void;
  clearSaveFailure: () => void;
}

const ConnectionStatusContext = createContext<ConnectionStatusValue | null>(null);

export function ConnectionStatusProvider({ children }: { children: React.ReactNode }) {
  // navigator.onLine is unreliable as a "real" connectivity signal but is the
  // best browser-native source we have. The 'connecting' state acts as a 600ms
  // bridge so we don't show a Live pill the instant the network event fires
  // (which sometimes precedes the actual fetch coming back).
  //
  // SSR HYDRATION (#418 fix): the initial render MUST be identical on server +
  // client, so seed `online = true` (→ "Live") on BOTH — NOT navigator.onLine,
  // which is undefined on the server and a real (possibly false / flapping) value
  // on the client → mismatched HTML → React #418 + a spurious "Offline" flash.
  // The real value is read in the effect below, AFTER mount.
  const [online, setOnline] = useState(true);
  const [bridging, setBridging] = useState(false);
  const [saveFailure, setSaveFailure] = useState<SaveFailure | null>(null);
  const bridgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Read real connectivity AFTER mount (post-hydration), never during the first
    // render. If genuinely offline at load, the pill flips to Offline here. This
    // one-shot post-mount sync IS the hydration-safe pattern (the #418 fix), so the
    // set-state-in-effect rule is intentionally suppressed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnline(navigator.onLine);
    const onOnline = () => {
      setBridging(true);
      setOnline(true);
      if (bridgeTimerRef.current) clearTimeout(bridgeTimerRef.current);
      bridgeTimerRef.current = setTimeout(() => setBridging(false), 600);
    };
    const onOffline = () => {
      if (bridgeTimerRef.current) clearTimeout(bridgeTimerRef.current);
      setBridging(false);
      setOnline(false);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (bridgeTimerRef.current) clearTimeout(bridgeTimerRef.current);
    };
  }, []);

  const reportSaveFailure = useCallback((message: string) => {
    setSaveFailure({ at: Date.now(), message });
  }, []);
  const reportSaveSuccess = useCallback(() => {
    setSaveFailure(null);
  }, []);
  const clearSaveFailure = useCallback(() => {
    setSaveFailure(null);
  }, []);

  const value = useMemo<ConnectionStatusValue>(() => {
    let state: ConnectionState;
    if (saveFailure) state = 'save_failed';
    else if (!online) state = 'offline';
    else if (bridging) state = 'connecting';
    else state = 'live';
    return {
      state,
      saveFailure,
      reportSaveFailure,
      reportSaveSuccess,
      clearSaveFailure,
    };
  }, [saveFailure, online, bridging, reportSaveFailure, reportSaveSuccess, clearSaveFailure]);

  return (
    <ConnectionStatusContext.Provider value={value}>
      {children}
    </ConnectionStatusContext.Provider>
  );
}

/** Read-only hook for the indicator. */
export function useConnectionStatus(): ConnectionStatusValue {
  const v = useContext(ConnectionStatusContext);
  if (!v) {
    // No provider mounted — return a sentinel that always
    // reports Live. Lets components live outside AppShell
    // (Storybook, tests) without crashing.
    return {
      state: 'live',
      saveFailure: null,
      reportSaveFailure: () => undefined,
      reportSaveSuccess: () => undefined,
      clearSaveFailure: () => undefined,
    };
  }
  return v;
}

interface PillStyle {
  fg: string;
  bg: string;
  border: string;
  dot: string;
  label: string;
}

const STYLES: Record<ConnectionState, PillStyle> = {
  live: {
    fg: 'var(--color-lp-success, #1f8a4c)',
    bg: 'color-mix(in srgb, #1f8a4c 10%, transparent)',
    border: 'color-mix(in srgb, #1f8a4c 35%, transparent)',
    dot: 'var(--color-lp-success, #1f8a4c)',
    label: 'Live',
  },
  connecting: {
    fg: 'var(--color-lp-warning, #c97a1d)',
    bg: 'color-mix(in srgb, #c97a1d 10%, transparent)',
    border: 'color-mix(in srgb, #c97a1d 35%, transparent)',
    dot: 'var(--color-lp-warning, #c97a1d)',
    label: 'Connecting…',
  },
  offline: {
    fg: 'var(--color-lp-error)',
    bg: 'color-mix(in srgb, var(--color-lp-error) 10%, transparent)',
    border: 'color-mix(in srgb, var(--color-lp-error) 35%, transparent)',
    dot: 'var(--color-lp-error)',
    label: 'Offline — refresh to reconnect',
  },
  save_failed: {
    fg: 'var(--color-lp-error)',
    bg: 'color-mix(in srgb, var(--color-lp-error) 10%, transparent)',
    border: 'color-mix(in srgb, var(--color-lp-error) 35%, transparent)',
    dot: 'var(--color-lp-error)',
    label: 'Save failed — last edit not stored',
  },
};

interface ConnectionIndicatorProps {
  /** Compact rendering = dot + short label only. Default: full
   *  label as documented in the spec. */
  compact?: boolean;
}

export function ConnectionIndicator({ compact = false }: ConnectionIndicatorProps) {
  const { state, saveFailure, clearSaveFailure } = useConnectionStatus();
  const s = STYLES[state];

  // Build the visible label. In save_failed state we add a
  // "Retry?" button suffix so the operator has a one-click
  // dismiss. Compact mode swaps the long copy for "Saved",
  // "Off", "Wait", "Failed".
  const compactLabel: Record<ConnectionState, string> = {
    live: 'Live',
    connecting: 'Wait',
    offline: 'Off',
    save_failed: 'Failed',
  };
  const label = compact ? compactLabel[state] : s.label;

  return (
    <span
      role="status"
      aria-live="polite"
      title={saveFailure?.message ?? s.label}
      className="inline-flex items-center"
      style={{
        gap: 6,
        padding: '2px 8px',
        fontSize: 'var(--lp-text-xs)',
        fontWeight: 'var(--lp-weight-medium)',
        color: s.fg,
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 999,
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: s.dot,
        }}
      />
      <span>{label}</span>
      {state === 'save_failed' ? (
        <button
          type="button"
          onClick={clearSaveFailure}
          style={{
            marginLeft: 4,
            padding: '0 6px',
            fontSize: 'var(--lp-text-2xs)',
            fontWeight: 'var(--lp-weight-semibold)',
            color: s.fg,
            background: 'transparent',
            border: `1px solid ${s.border}`,
            borderRadius: 999,
            cursor: 'pointer',
          }}
        >
          Dismiss
        </button>
      ) : null}
    </span>
  );
}
