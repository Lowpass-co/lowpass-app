'use client';

/* ============================================
   LOWPASS — RealtimeIndicator (Sprint 9 §4)

   Small pill that surfaces Supabase Realtime connection state.
   Connected = orange dot + "Live"; disconnected = gray dot +
   "Offline". Sits in page headers next to the "last edit by X"
   line. Non-blocking — edits keep working when offline.
   ============================================ */

import { useEffect, useState } from 'react';

interface RealtimeIndicatorProps {
  connected: boolean;
  /** Optional label override; defaults to Live / Offline. */
  liveLabel?: string;
  offlineLabel?: string;
}

export function RealtimeIndicator({
  connected,
  liveLabel = 'Live',
  offlineLabel = 'Offline',
}: RealtimeIndicatorProps) {
  // Suppress brief Offline flicker on initial mount: only show
  // the offline pill after we've been disconnected for ~600ms.
  // Connected state is shown immediately. Mirrors the
  // MembersListClient eslint-disable: this is a debouncing
  // effect that legitimately gates a setState on a timer; the
  // rule is overzealous for this canonical case.
  const [showOffline, setShowOffline] = useState(false);
  useEffect(() => {
    if (connected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowOffline(false);
      return;
    }
    const t = setTimeout(() => setShowOffline(true), 600);
    return () => clearTimeout(t);
  }, [connected]);

  if (!connected && !showOffline) return null;

  return (
    <span
      className="inline-flex items-center"
      role="status"
      aria-live="polite"
      style={{
        gap: 6,
        padding: '2px 8px',
        fontSize: 'var(--lp-text-xs)',
        fontWeight: 'var(--lp-weight-medium)',
        color: connected ? 'var(--color-lp-orange)' : 'var(--lp-text-tertiary)',
        background: connected
          ? 'color-mix(in srgb, var(--color-lp-orange) 8%, transparent)'
          : 'var(--lp-panel)',
        border: connected
          ? '1px solid color-mix(in srgb, var(--color-lp-orange) 30%, transparent)'
          : '1px solid var(--lp-border-subtle)',
        borderRadius: 999,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: connected
            ? 'var(--color-lp-orange)'
            : 'var(--lp-text-tertiary)',
        }}
      />
      {connected ? liveLabel : offlineLabel}
    </span>
  );
}
