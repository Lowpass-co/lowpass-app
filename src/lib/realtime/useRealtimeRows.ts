/* ============================================
   LOWPASS — useRealtimeRows hook (Sprint 9 §4)

   Thin wrapper over Supabase Realtime postgres_changes for
   collaborator-row updates. Subscribes to INSERT/UPDATE/DELETE
   events on a single table, optionally scoped to a column =
   value filter, and fires onChange for each event. Returns a
   `connected` boolean for UIs that want to surface a "Live"
   indicator vs "Offline".

   Usage:
     useRealtimeRows({
       table: 'routing',
       filterColumn: 'tour_id',
       filterValue: tourId,
       onChange: (event) => refetch(),
     });

   Cleanup: hook removes the channel on unmount and on filter
   change. Multiple components subscribing to the same table
   create independent channels — Supabase deduplicates on the
   server. For high-frequency surfaces a single shared channel
   could be added later via context; v1 keeps it simple.

   See src/lib/realtime/README.md for the integration pattern.
   ============================================ */

'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-client';

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface RealtimeRowEvent {
  type: RealtimeEventType;
  table: string;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}

export interface UseRealtimeRowsOptions {
  /** Postgres table name in the public schema. */
  table: string;
  /** Optional filter column name (e.g. 'tour_id'). */
  filterColumn?: string | null;
  /** Filter value to compare with eq. */
  filterValue?: string | number | null;
  /** Subset of event types to subscribe to. Defaults to all. */
  events?: ReadonlyArray<RealtimeEventType>;
  /** Fired on each matching change. */
  onChange: (event: RealtimeRowEvent) => void;
  /** Set to false to short-circuit subscription (e.g. waiting on tourId). */
  enabled?: boolean;
}

/**
 * Subscribe to row-level changes on a Postgres table via Supabase Realtime.
 * Returns { connected } so callers can render a "Live" indicator.
 */
export function useRealtimeRows({
  table,
  filterColumn = null,
  filterValue = null,
  events = ['INSERT', 'UPDATE', 'DELETE'],
  onChange,
  enabled = true,
}: UseRealtimeRowsOptions): { connected: boolean } {
  const [connected, setConnected] = useState(false);

  // Sprint 9 §7.1 — stable dep for the events array. Default
  // value `['INSERT','UPDATE','DELETE']` is a fresh literal
  // every render; if it lived in the effect deps directly,
  // React would tear down + re-establish the channel on every
  // parent render and the Live pill would flicker. Joining
  // into a string gives us a stable primitive identity per
  // unique event-set.
  const eventsKey = events.join(',');

  // Keep latest onChange in a ref so we don't tear down the
  // channel every time the parent re-renders with a new
  // closure. Same defensive pattern as SwitcherPane.onExitDone.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled) return;
    if (filterColumn && (filterValue === null || filterValue === undefined)) {
      // Filter requested but value not yet ready — bail; effect
      // re-runs when filterValue resolves.
      return;
    }

    const supabase = createClient();
    const channelName = `lp-realtime:${table}:${filterColumn ?? '*'}:${filterValue ?? '*'}`;
    let channel: RealtimeChannel | null = supabase.channel(channelName);

    for (const ev of events) {
      const config: {
        event: RealtimeEventType;
        schema: string;
        table: string;
        filter?: string;
      } = {
        event: ev,
        schema: 'public',
        table,
      };
      if (filterColumn && filterValue !== null && filterValue !== undefined) {
        config.filter = `${filterColumn}=eq.${filterValue}`;
      }
      channel = channel.on(
        // The Supabase JS types for `on()` are heavy; cast the event-type
        // discriminator string to keep this generic at the call-site.
        'postgres_changes' as unknown as 'system',
        config as unknown as { event: '*' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          onChangeRef.current({
            type: payload.eventType as RealtimeEventType,
            table,
            new: (payload.new as Record<string, unknown> | null) ?? null,
            old: (payload.old as Record<string, unknown> | null) ?? null,
          });
        },
      );
    }

    channel.subscribe((status) => {
      setConnected(status === 'SUBSCRIBED');
    });

    return () => {
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- events is intentionally tracked via eventsKey (stable join string)
  }, [table, filterColumn, filterValue, enabled, eventsKey]);

  return { connected };
}
