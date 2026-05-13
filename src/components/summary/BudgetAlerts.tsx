'use client';

/* ============================================
   LOWPASS — <BudgetAlerts> (Sprint 12 §SAFE rewrite)

   Pre-§SAFE: auto-fired on tour summary mount + sessionStorage
   cache. Every visit billed the AI key the first time and
   then served from cache for 5min. Bad UX (you can't see when
   the data is stale) AND expensive (auto-fire on a page that
   users hit constantly).

   §SAFE: opt-in via a "Check my budget" button. The component
   renders the button only until the operator clicks it; the
   alerts render below the button afterwards. A "Refresh"
   button reruns the check, disabled for 30s post-click to
   discourage hammering.

   sessionStorage is gone — the server-side cache (5min per
   user+tour, see /api/budget/ai/alerts) is enough.
   ============================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Alert {
  severity: 'info' | 'warning' | 'critical';
  category: string;
  message: string;
  detail?: string;
}

const REFRESH_COOLDOWN_MS = 30_000;

export function BudgetAlerts({ tourId }: { tourId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'loaded'>('idle');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [cooldownLeftMs, setCooldownLeftMs] = useState(0);
  const cooldownEndRef = useRef(0);

  const fetchAlerts = useCallback(async () => {
    setState('loading');
    try {
      const res = await fetch(`/api/budget/ai/alerts?tour_id=${encodeURIComponent(tourId)}`);
      const json = await res.json().catch(() => ({}));
      const list = Array.isArray(json.alerts) ? (json.alerts as Alert[]) : [];
      setAlerts(list);
      setState('loaded');
      cooldownEndRef.current = Date.now() + REFRESH_COOLDOWN_MS;
      setCooldownLeftMs(REFRESH_COOLDOWN_MS);
    } catch {
      setAlerts([]);
      setState('loaded');
    }
  }, [tourId]);

  /* Tick the cooldown counter so the Refresh button can show
     a live "(Xs)" suffix. The interval clears itself when the
     cooldown lapses, so it doesn't run while idle. */
  useEffect(() => {
    if (cooldownLeftMs <= 0) return;
    const id = window.setInterval(() => {
      const left = Math.max(0, cooldownEndRef.current - Date.now());
      setCooldownLeftMs(left);
      if (left <= 0) window.clearInterval(id);
    }, 250);
    return () => window.clearInterval(id);
  }, [cooldownLeftMs]);

  /* Render: pre-check state shows just the button so we don't
     bill the AI on mount. Post-check shows the alerts + a
     Refresh button (disabled during cooldown). */
  if (state === 'idle') {
    return (
      <div className="rounded-xl border border-lp-border bg-lp-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-lp-text-tertiary">
            Budget alerts
          </h2>
        </div>
        <p className="mt-2 text-xs text-lp-text-secondary">
          Run an AI variance check on this tour&apos;s budget. Costs a tiny amount each
          time — only runs when you ask.
        </p>
        <button
          type="button"
          onClick={fetchAlerts}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-lp-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-lp-orange/90"
        >
          <Sparkles className="h-4 w-4" />
          Check my budget
        </button>
      </div>
    );
  }

  const icon = (a: Alert) => {
    if (a.severity === 'critical') return <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />;
    if (a.severity === 'warning')
      return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />;
    return <Info className="h-4 w-4 shrink-0 text-blue-500" />;
  };

  const refreshDisabled = state === 'loading' || cooldownLeftMs > 0;
  const refreshLabel = (() => {
    if (state === 'loading') return 'Analysing…';
    if (cooldownLeftMs > 0) return `Refresh (${Math.ceil(cooldownLeftMs / 1000)}s)`;
    return 'Refresh';
  })();

  return (
    <div className="rounded-xl border border-lp-border bg-lp-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-lp-text-tertiary">
          Budget alerts
        </h2>
        <button
          type="button"
          onClick={fetchAlerts}
          disabled={refreshDisabled}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-lp-orange hover:underline disabled:opacity-50 disabled:no-underline"
        >
          {state === 'loading' && <Loader2 className="h-3 w-3 animate-spin" />}
          {refreshLabel}
        </button>
      </div>
      {state === 'loading' && alerts.length === 0 ? (
        <div className="mt-3 text-xs text-lp-text-secondary">
          Analysing this tour&apos;s budget — usually 3-5 seconds…
        </div>
      ) : alerts.length === 0 ? (
        <div className="mt-3 text-xs text-lp-text-secondary">
          No alerts surfaced for this tour. Click Refresh to re-run.
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {alerts.map((a, i) => (
            <li
              key={i}
              className={cn(
                'rounded-lg border p-2.5 text-sm',
                a.severity === 'critical' && 'border-red-500/30 bg-red-500/5',
                a.severity === 'warning' && 'border-amber-500/30 bg-amber-500/5',
                a.severity === 'info' && 'border-lp-border bg-lp-surface-secondary/50',
              )}
            >
              <button
                type="button"
                className="flex w-full items-start gap-2 text-left"
                onClick={() => setExpandedId(expandedId === i ? null : i)}
              >
                {icon(a)}
                <span className="flex-1 font-medium text-lp-text">{a.message}</span>
              </button>
              {a.detail && expandedId === i && (
                <p className="mt-2 pl-6 text-xs text-lp-text-secondary">{a.detail}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
