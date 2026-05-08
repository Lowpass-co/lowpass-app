'use client';

/* ============================================
   LOWPASS — AuditLogClient (Sprint 9 §10)

   Site-admin audit log. Paginated (offset; switch to keyset
   when audit_log > 10K rows — Sprint 12+).

   Shows: timestamp, actor name, workspace name, action +
   entity_type, summary line. Filters: workspace + action +
   since.
   ============================================ */

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toTitleCase } from '@/lib/text/toTitleCase';

interface AuditEntry {
  id: string;
  workspace_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  field_changes: Record<string, unknown> | null;
  created_at: string;
  actor_name: string | null;
  workspace_name: string | null;
}

const PAGE_SIZE = 50;

const PRESET_RANGES: ReadonlyArray<{ value: string; label: string; days: number | null }> = [
  { value: '1', label: 'Last 24h', days: 1 },
  { value: '7', label: 'Last 7d', days: 7 },
  { value: '30', label: 'Last 30d', days: 30 },
  { value: '90', label: 'Last 90d', days: 90 },
  { value: 'all', label: 'All time', days: null },
];

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString();
}

function summary(entry: AuditEntry): string {
  const fc = entry.field_changes ?? {};
  const parts: string[] = [];
  parts.push(entry.action.replace(/_/g, ' '));
  parts.push(entry.entity_type.replace(/_/g, ' '));
  if (entry.entity_id) {
    parts.push(`(${entry.entity_id.slice(0, 8)}…)`);
  }
  // Surface a small hint from field_changes when present.
  if (typeof fc === 'object' && fc) {
    if ('from' in fc && 'to' in fc) {
      parts.push(`${String(fc.from)} → ${String(fc.to)}`);
    } else if ('rows_saved' in fc) {
      parts.push(`(${String(fc.rows_saved)} rows)`);
    } else if ('archived_at' in fc) {
      parts.push('archived');
    }
  }
  return parts.join(' · ');
}

export function AuditLogClient() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeKey, setRangeKey] = useState<string>('7');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [workspaceFilter, setWorkspaceFilter] = useState<string>('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const fetchEntries = useCallback(
    async (replace: boolean) => {
      setError(null);
      const params = new URLSearchParams();
      const range = PRESET_RANGES.find((r) => r.value === rangeKey);
      if (range && range.days != null) {
        const sinceMs = Date.now() - range.days * 86400000;
        params.set('since', new Date(sinceMs).toISOString());
      }
      if (actionFilter) params.set('action', actionFilter);
      if (workspaceFilter) params.set('workspace_id', workspaceFilter);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(replace ? 0 : offset));
      try {
        const res = await fetch(`/api/admin/audit?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(body?.error ?? `Failed to load (${res.status})`);
          return;
        }
        const body = (await res.json()) as { entries: AuditEntry[] };
        setEntries((prev) => (replace ? body.entries : [...prev, ...body.entries]));
        setHasMore(body.entries.length === PAGE_SIZE);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    },
    [rangeKey, actionFilter, workspaceFilter, offset],
  );

  useEffect(() => {
    setLoading(true);
    setOffset(0);
    void fetchEntries(true).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey, actionFilter, workspaceFilter]);

  function loadMore() {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    void fetchEntries(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-4)' }}>
      {/* Filter row */}
      <div className="flex flex-wrap items-center" style={{ gap: 'var(--lp-space-2)' }}>
        <FilterSelect
          label="Range"
          value={rangeKey}
          onChange={setRangeKey}
          options={PRESET_RANGES.map((r) => ({ value: r.value, label: r.label }))}
        />
        <input
          type="text"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          placeholder="Action filter (e.g. status_changed)…"
          style={{
            flex: 1,
            minWidth: 220,
            padding: 'var(--lp-space-2) var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text)',
            background: 'var(--lp-bg)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            outline: 'none',
          }}
        />
        <input
          type="text"
          value={workspaceFilter}
          onChange={(e) => setWorkspaceFilter(e.target.value.trim())}
          placeholder="Workspace ID (UUID)…"
          style={{
            flex: 1,
            minWidth: 240,
            padding: 'var(--lp-space-2) var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text)',
            background: 'var(--lp-bg)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            outline: 'none',
            fontFamily: 'var(--lp-font-mono, ui-monospace, SFMono-Regular)',
          }}
        />
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            padding: 'var(--lp-space-2) var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--color-lp-error)',
            background: 'color-mix(in srgb, var(--color-lp-error) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-lp-error) 25%, transparent)',
            borderRadius: 'var(--lp-radius-md)',
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div
          className="flex items-center"
          style={{
            gap: 'var(--lp-space-2)',
            padding: 'var(--lp-space-6)',
            color: 'var(--lp-text-tertiary)',
            fontSize: 'var(--lp-text-sm)',
          }}
        >
          <Loader2 size={14} className="animate-spin" />
          Loading…
        </div>
      ) : entries.length === 0 ? (
        <div
          style={{
            padding: 'var(--lp-space-6)',
            textAlign: 'center',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-tertiary)',
            background: 'var(--lp-panel)',
            border: '1px dashed var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
          }}
        >
          No audit entries match.
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {entries.map((e) => (
            <li
              key={e.id}
              style={{
                display: 'flex',
                gap: 'var(--lp-space-3)',
                padding: 'var(--lp-space-3) 0',
                borderBottom: '1px solid var(--lp-border-subtle)',
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--lp-text)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  marginTop: 6,
                  borderRadius: 999,
                  background: 'var(--color-lp-orange)',
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="block">
                  <strong>
                    {e.actor_name ? toTitleCase(e.actor_name) : 'System'}
                  </strong>{' '}
                  <span style={{ color: 'var(--lp-text-secondary)' }}>
                    in <strong>{e.workspace_name ?? '—'}</strong>
                  </span>
                </span>
                <span
                  className="block"
                  style={{
                    marginTop: 2,
                    fontSize: 'var(--lp-text-xs)',
                    color: 'var(--lp-text-tertiary)',
                  }}
                >
                  {summary(e)}
                </span>
              </span>
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 'var(--lp-text-xs)',
                  color: 'var(--lp-text-tertiary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {relativeTime(e.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {hasMore && !loading ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            className="btn-transition"
            style={{
              padding: 'var(--lp-space-2) var(--lp-space-4)',
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text)',
              background: 'transparent',
              border: '1px solid var(--lp-border-strong)',
              borderRadius: 'var(--lp-radius-md)',
              cursor: 'pointer',
            }}
          >
            Load more
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}

function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <label
      className="inline-flex items-center"
      style={{
        gap: 6,
        fontSize: 'var(--lp-text-xs)',
        color: 'var(--lp-text-tertiary)',
      }}
    >
      <span>{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '2px 8px',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text)',
          background: 'var(--lp-bg)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 'var(--lp-radius-sm)',
          cursor: 'pointer',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
