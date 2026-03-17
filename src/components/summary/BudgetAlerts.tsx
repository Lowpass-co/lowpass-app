'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const CACHE_KEY_PREFIX = 'lp-budget-alerts-';
const CACHE_TTL_MS = 5 * 60 * 1000;

interface Alert {
  severity: 'info' | 'warning' | 'critical';
  category: string;
  message: string;
  detail?: string;
}

export function BudgetAlerts({ tourId }: { tourId: string }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchAlerts = useCallback(async (bypassCache = false) => {
    const cacheKey = CACHE_KEY_PREFIX + tourId;
    if (!bypassCache && typeof sessionStorage !== 'undefined') {
      try {
        const raw = sessionStorage.getItem(cacheKey);
        if (raw) {
          const { at, data } = JSON.parse(raw);
          if (Date.now() - at < CACHE_TTL_MS && Array.isArray(data)) {
            setAlerts(data);
            return;
          }
        }
      } catch {
        // ignore
      }
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/budget/ai/alerts?tour_id=${encodeURIComponent(tourId)}`);
      const json = await res.json().catch(() => ({}));
      const list = Array.isArray(json.alerts) ? json.alerts : [];
      setAlerts(list);
      if (typeof sessionStorage !== 'undefined') {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data: list }));
        } catch {
          // ignore
        }
      }
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [tourId]);

  useEffect(() => {
    if (tourId) fetchAlerts();
  }, [tourId, fetchAlerts]);

  if (alerts.length === 0 && !loading) return null;

  const icon = (a: Alert) => {
    if (a.severity === 'critical') return <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />;
    if (a.severity === 'warning') return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />;
    return <Info className="h-4 w-4 shrink-0 text-blue-500" />;
  };

  return (
    <div className="rounded-xl border border-lp-border bg-lp-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-lp-text-tertiary">Budget alerts</h2>
        <button
          type="button"
          onClick={() => fetchAlerts(true)}
          disabled={loading}
          className="text-xs font-medium text-lp-orange hover:underline disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh alerts'}
        </button>
      </div>
      <ul className="mt-3 space-y-2">
        {alerts.map((a, i) => (
          <li
            key={i}
            className={cn(
              'rounded-lg border p-2.5 text-sm',
              a.severity === 'critical' && 'border-red-500/30 bg-red-500/5',
              a.severity === 'warning' && 'border-amber-500/30 bg-amber-500/5',
              a.severity === 'info' && 'border-lp-border bg-lp-surface-secondary/50'
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
    </div>
  );
}
