'use client';

import { useState } from 'react';
import { createSection } from '@/lib/rider-packs/client';
import {
  RIDER_PACK_TEMPLATES,
  makeUniqueSectionKey,
  type RiderPackTemplate,
} from '@/lib/rider-packs/templates';
import type { ResolvedSection } from '@/lib/rider-packs/types';

type Props = {
  packId: string;
  sections: ResolvedSection[];
  onApplied: () => void | Promise<void>;
};

export function RiderTemplateSuggestions({ packId, sections, onApplied }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const applyTemplate = async (template: RiderPackTemplate) => {
    if (busyId) return;
    setErr(null);
    setBusyId(template.id);
    const keys = new Set(sections.map((s) => s.section_key));
    let sortBase =
      sections.length > 0 ? Math.max(...sections.map((s) => s.sort_order)) + 10 : 10;
    try {
      for (const sec of template.sections) {
        const sectionKey = makeUniqueSectionKey(sec.section_key, keys);
        keys.add(sectionKey);
        await createSection(packId, {
          section_key: sectionKey,
          title: sec.title,
          sort_order: sortBase,
          fields: sec.fields,
        });
        sortBase += 10;
      }
      await onApplied();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add template');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ backgroundColor: 'var(--lp-surface)', borderColor: 'var(--lp-border)' }}
    >
      <div
        className="border-b px-4 py-2.5"
        style={{ borderColor: 'var(--lp-border)' }}
      >
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">
          Start from a full rider template
        </h2>
        <p className="mt-1 text-xs text-lp-text-secondary">
          Adds sections and placeholder fields you can rename, remove, or extend — same as building from scratch.
        </p>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        {RIDER_PACK_TEMPLATES.map((t) => (
          <div
            key={t.id}
            className="flex flex-col rounded-lg border border-lp-border bg-lp-bg-secondary p-3"
          >
            <div className="text-sm font-semibold text-lp-text">{t.name}</div>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-lp-text-secondary">
              {t.description}
            </p>
            <p className="mt-2 text-[10px] text-lp-text-tertiary">
              {t.sections.length} section{t.sections.length === 1 ? '' : 's'}
            </p>
            <button
              type="button"
              disabled={busyId != null}
              onClick={() => void applyTemplate(t)}
              className="mt-3 rounded-lg border border-lp-border bg-lp-surface px-3 py-1.5 text-xs font-medium text-lp-text hover:bg-lp-surface-hover disabled:opacity-50"
            >
              {busyId === t.id ? 'Adding…' : 'Add to pack'}
            </button>
          </div>
        ))}
      </div>
      {err && (
        <div className="border-t border-lp-border px-4 py-2 text-xs text-lp-error" style={{ borderColor: 'var(--lp-border)' }}>
          {err}
        </div>
      )}
    </div>
  );
}
