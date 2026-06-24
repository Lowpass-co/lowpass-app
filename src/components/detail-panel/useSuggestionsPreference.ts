'use client';

/* ============================================================
   LOWPASS — AI suggestions preference (client hook)

   Backs the in-panel gate (LineItemDetailPanel). The effective
   preference is fetched ONCE and cached at module scope, so opening N
   line-item panels does not refetch — every hook instance shares the
   same cache. A PATCH (or an explicit refresh) updates the cache and
   broadcasts a window event, so all mounted hooks reflect the new value
   without a page reload.

   This is the "module cache" wiring the gate ticket allows in place of
   a high-mounted context provider — the panel mounts under two
   different layouts (tours/[id] and budget), so a singleton is the
   least error-prone shared source.
   ============================================================ */

import { useCallback, useEffect, useState } from 'react';

interface PrefData {
  suggestions_enabled: boolean;
  user_override: boolean | null;
  workspace_default: boolean;
}

const PREF_CHANGED_EVENT = 'lp-suggestions-pref-changed';

let cache: PrefData | null = null;
let inflight: Promise<PrefData | null> | null = null;

function normalise(json: unknown): PrefData {
  const j = (json ?? {}) as Partial<PrefData>;
  return {
    suggestions_enabled: Boolean(j.suggestions_enabled),
    user_override: typeof j.user_override === 'boolean' ? j.user_override : null,
    workspace_default: Boolean(j.workspace_default),
  };
}

async function fetchPref(force = false): Promise<PrefData | null> {
  if (!force && cache) return cache;
  if (!force && inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch('/api/ai/preferences');
      if (!res.ok) return null;
      cache = normalise(await res.json());
      return cache;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export interface SuggestionsPreference {
  /** The resolved effective value the panel gates on. */
  enabled: boolean;
  /** The user's explicit choice, or null when following the default. */
  override: boolean | null;
  /** The workspace default the override folds over. */
  workspaceDefault: boolean;
  /** False until the first fetch resolves. */
  loaded: boolean;
  /** Upsert the caller's own preference (null reverts to the default). */
  setPreference: (value: boolean | null) => Promise<void>;
  /** Force a refetch (e.g. after an out-of-band change). */
  refresh: () => Promise<void>;
}

export function useSuggestionsPreference(): SuggestionsPreference {
  const [data, setData] = useState<PrefData | null>(cache);
  const [loaded, setLoaded] = useState<boolean>(cache != null);

  useEffect(() => {
    let active = true;
    void fetchPref().then((d) => {
      if (!active) return;
      setData(d);
      setLoaded(true);
    });
    const onChange = () => {
      setData(cache);
      setLoaded(true);
    };
    window.addEventListener(PREF_CHANGED_EVENT, onChange);
    return () => {
      active = false;
      window.removeEventListener(PREF_CHANGED_EVENT, onChange);
    };
  }, []);

  const setPreference = useCallback(async (value: boolean | null) => {
    const res = await fetch('/api/ai/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestions_enabled: value }),
    });
    if (res.ok) {
      cache = normalise(await res.json());
      window.dispatchEvent(new CustomEvent(PREF_CHANGED_EVENT));
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetchPref(true);
    window.dispatchEvent(new CustomEvent(PREF_CHANGED_EVENT));
  }, []);

  return {
    enabled: data?.suggestions_enabled ?? false,
    override: data?.user_override ?? null,
    workspaceDefault: data?.workspace_default ?? false,
    loaded,
    setPreference,
    refresh,
  };
}
