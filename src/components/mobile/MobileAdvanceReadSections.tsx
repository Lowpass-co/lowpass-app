'use client';

import type { LucideIcon } from 'lucide-react';
import { getAdvanceBlock } from '@/components/advance/blocks/registry';

type FieldDef = {
  id: string;
  label: string;
  type: string;
  [key: string]: unknown;
};

type SectionDef = {
  template_id: string;
  label: string;
  fields: FieldDef[];
};

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value === 'number' && !Number.isFinite(value)) return true;
  if (typeof value === 'string' && !value.trim()) return true;
  return false;
}

function FieldPlain({ field, value }: { field: FieldDef; value: unknown }) {
  if (isBlank(value)) return null;

  const v = value as Record<string, unknown> | unknown;

  if (field.type === 'contact') {
    const rows = Array.isArray(v) ? v : [v];
    return (
      <div className="space-y-2">
        {(rows as { first_name?: string; last_name?: string; phone?: string; email?: string; role?: string }[]).map(
          (c, idx) =>
            typeof c !== 'object' || !c ? null : (
              <div key={idx}>
                <p className="text-[15px] font-medium leading-relaxed text-lp-text">
                  {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                  {c.role ? <span className="text-lp-text-secondary"> · {c.role}</span> : null}
                </p>
                {c.phone ? (
                  <a href={`tel:${c.phone}`} className="text-sm text-lp-orange">
                    {c.phone}
                  </a>
                ) : null}
                {c.email ? (
                  <a href={`mailto:${c.email}`} className="ml-3 text-sm text-lp-orange">
                    {c.email}
                  </a>
                ) : null}
              </div>
            )
        )}
      </div>
    );
  }

  if (field.type === 'file') return null;

  if (field.type === 'boolean') {
    const b = value === true || value === 'true' || value === 1;
    return (
      <p className="text-[15px] leading-relaxed text-lp-text">
        {b ? 'Yes' : 'No'}
      </p>
    );
  }

  if (field.type === 'currency' || field.type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) return <p className="text-[15px]">{String(value)}</p>;
    if (field.type === 'currency') {
      return <p className="text-[15px] font-medium tabular-nums">{n.toFixed(2)}</p>;
    }
    return <p className="text-[15px] tabular-nums">{n.toLocaleString()}</p>;
  }

  const str = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  return <p className="whitespace-pre-line text-[15px] leading-relaxed text-lp-text">{str}</p>;
}

/** Read-only accordion section for one advance template. */
export function MobileAdvanceSectionAccordion({
  section,
  data,
  routingId,
}: {
  section: SectionDef;
  data: Record<string, unknown>;
  icon?: LucideIcon;
  /** Needed to render REGISTERED blocks (e.g. labor calls) on /m/today. */
  routingId?: string;
}) {
  const rows = section.fields
    .map((field) => {
      // P6 — REGISTERED blocks render their own read view (registry.tsx). Crew
      // care about the labor call schedule, so it shows as its own block on
      // /m/today rather than a JSON blob.
      const block = getAdvanceBlock(field.type);
      if (block && routingId) {
        const ReadView = block.ReadView;
        return (
          <div key={field.id}>
            <p className="text-[13px] font-semibold uppercase tracking-wide text-lp-text-tertiary">{field.label}</p>
            <div className="mt-1">
              <ReadView tourId="" routingId={routingId} />
            </div>
          </div>
        );
      }
      return ['file'].includes(field.type) ? null : (
        !isBlank(data[field.id]) ? (
          <div key={field.id}>
            <p className="text-[13px] font-semibold uppercase tracking-wide text-lp-text-tertiary">{field.label}</p>
            <div className="mt-1">
              <FieldPlain field={field} value={data[field.id]} />
            </div>
          </div>
        ) : null
      );
    })
    .filter(Boolean);

  if (rows.length === 0) return null;

  return (
    <details open className="rounded-2xl border border-lp-border bg-lp-surface shadow-[0_1px_4px_rgba(0,0,0,.06)]">
      <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="text-[17px] font-semibold tracking-tight text-lp-text">{section.label}</span>
      </summary>
      <div className="space-y-4 border-t border-lp-border/60 px-4 py-4">{rows}</div>
    </details>
  );
}
