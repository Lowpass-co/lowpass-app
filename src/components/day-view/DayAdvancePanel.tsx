'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface DayAdvancePanelProps {
  tourId: string;
  routingId: string;
}

interface AdvanceSection {
  template_id: string;
  label: string;
  fields: { id?: string; label?: string; type?: string }[];
  order: number;
}

interface AdvanceData {
  instance_id?: string;
  status?: string;
  sections?: AdvanceSection[];
  data?: Record<string, Record<string, unknown>>;
}

function formatAdvanceFieldValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    const parts = value.map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const o = item as Record<string, unknown>;
        if ('type' in o || 'time' in o) {
          const type = o.type != null && o.type !== '' ? String(o.type) : '';
          const time = o.time != null && o.time !== '' ? String(o.time) : '';
          const line = [type, time].filter(Boolean).join(' · ');
          return line || null;
        }
      }
      try {
        return JSON.stringify(item);
      } catch {
        return String(item);
      }
    });
    const joined = parts.filter((p) => p != null && p !== '—').join('; ');
    return joined || '—';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function DayAdvancePanel({ tourId, routingId }: DayAdvancePanelProps) {
  const [advance, setAdvance] = useState<AdvanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ sectionId: string; fieldId: string } | null>(null);

  const fetchAdvance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/advance/${routingId}`);
      if (!res.ok) {
        setAdvance(null);
        return;
      }
      const json = await res.json();
      const adv = json.advance ?? null;
      setAdvance(adv);
      const first = adv?.sections?.[0];
      setActiveTab(first?.template_id ?? null);
    } finally {
      setLoading(false);
    }
  }, [tourId, routingId]);

  useEffect(() => {
    fetchAdvance();
  }, [fetchAdvance]);

  const saveField = useCallback(
    async (sectionId: string, fieldId: string, value: unknown) => {
      if (!advance?.data) return;
      const sectionData = { ...(advance.data[sectionId] ?? {}), [fieldId]: value };
      const newData = { ...advance.data, [sectionId]: sectionData };
      const res = await fetch(`/api/tours/${tourId}/advance/${routingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: newData }),
      });
      if (res.ok) {
        setAdvance((prev) =>
          prev ? { ...prev, data: { ...prev.data, [sectionId]: sectionData } } : null
        );
      }
      setEditing(null);
    },
    [tourId, routingId, advance]
  );

  if (loading) {
    return (
      <div className="text-sm text-lp-text-secondary animate-pulse">Loading advance…</div>
    );
  }

  if (!advance?.sections?.length) {
    return (
      <p className="text-sm text-lp-text-secondary">
        No advance info yet.{' '}
        <Link
          href={`/tours/${tourId}/advance/${routingId}`}
          className="text-lp-orange font-semibold hover:underline"
        >
          Start advance →
        </Link>
      </p>
    );
  }

  const sections = advance.sections;
  const currentSection = sections.find((s) => s.template_id === activeTab) ?? sections[0];
  const sectionId = currentSection?.template_id ?? '';
  const sectionData = advance.data?.[sectionId] ?? {};
  const fields = currentSection?.fields ?? [];

  return (
    <div className="space-y-3">
      <nav className="flex flex-wrap gap-1 border-b border-lp-border/50 pb-1">
        {sections.map((sec) => (
          <button
            key={sec.template_id}
            type="button"
            onClick={() => setActiveTab(sec.template_id)}
            className={cn(
              'text-xs uppercase tracking-wider px-2 py-1 rounded-t transition-colors',
              activeTab === sec.template_id
                ? 'border-b-2 border-lp-orange text-lp-text font-semibold'
                : 'text-lp-text-secondary hover:text-lp-text'
            )}
          >
            {sec.label}
          </button>
        ))}
      </nav>
      <div className="space-y-2">
        {fields.map((field) => {
          const fieldId = (field as { id?: string }).id ?? '';
          const label = (field as { label?: string }).label ?? fieldId;
          const value = sectionData[fieldId];
          const isEditing = editing?.sectionId === sectionId && editing?.fieldId === fieldId;
          const displayValue = formatAdvanceFieldValue(value);

          return (
            <div key={fieldId} className="flex justify-between items-start gap-2 py-1 text-sm">
              <span className="text-lp-text-secondary shrink-0">{label}</span>
              {isEditing ? (
                <input
                  type="text"
                  defaultValue={displayValue === '—' ? '' : displayValue}
                  autoFocus
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    saveField(sectionId, fieldId, v || null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  className="min-w-0 flex-1 rounded border border-lp-border bg-lp-surface px-2 py-0.5 text-lp-text"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing({ sectionId, fieldId })}
                  className="text-right text-lp-text hover:bg-lp-orange/10 rounded px-1 -mx-1 min-w-0 truncate max-w-full"
                >
                  {displayValue}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="pt-1 text-xs text-lp-text-secondary">
        <Link
          href={`/tours/${tourId}/advance/${routingId}`}
          className="text-lp-orange hover:underline"
        >
          Open full advance →
        </Link>
      </p>
    </div>
  );
}
